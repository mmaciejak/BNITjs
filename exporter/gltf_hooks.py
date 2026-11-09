"""Hooks for Blender's bundled glTF exporter (io_scene_gltf2).

The glTF exporter looks for a ``glTF2ExportUserExtension`` class on every enabled add-on and
calls its hooks during export. This module adds:

- ``EXT_blender_shader_graph`` on each material: the flattened node graph. The standard glTF
  PBR material that the exporter writes stays in place as the fallback for viewers that don't
  know the extension, so the extension is never marked required.
- ``EXT_blender_shader_graph`` on each node that has a mesh: per-object data that Blender
  inputs need (Object Info, Generated texture coordinates).
"""

import json
import os
import tempfile

import bpy

from . import settings as export_settings_module
from .bake_fallback import bake_unsupported
from .graph_export import export_material_graph, export_world_graph, unsupported_nodes
from .pbr_bake import bake_pbr
from .sky_bake import bake_sky
from .values import f32

EXTENSION_NAME = "EXT_blender_shader_graph"


_M32 = 0xFFFFFFFF


def _rot(x, k):
    return ((x << k) | (x >> (32 - k))) & _M32


def hash_uint2(kx, ky):
    """Cycles' hash_uint2 (Bob Jenkins' lookup3 final mix), util/hash.h."""
    a = b = c = (0xDEADBEEF + (2 << 2) + 13) & _M32
    b = (b + ky) & _M32
    a = (a + kx) & _M32
    c ^= b
    c = (c - _rot(b, 14)) & _M32
    a ^= c
    a = (a - _rot(c, 11)) & _M32
    b ^= a
    b = (b - _rot(a, 25)) & _M32
    c ^= b
    c = (c - _rot(b, 16)) & _M32
    a ^= c
    a = (a - _rot(c, 4)) & _M32
    b ^= a
    b = (b - _rot(a, 14)) & _M32
    c ^= b
    c = (c - _rot(b, 24)) & _M32
    return c


def hash_string(text):
    """Cycles' hash_string: i = i * 37 + c over the UTF-8 bytes."""
    i = 0
    for ch in text.encode("utf-8"):
        i = (i * 37 + ch) & _M32
    return i


def object_random(name):
    """Object Info > Random for a non-instanced object, as Cycles computes it from the name."""
    return hash_uint2(hash_string(name), 0) / _M32


def _all_nodes(tree, seen=None):
    """Nodes of a tree and of the node groups inside it."""
    seen = seen if seen is not None else set()
    if tree is None or tree.name_full in seen:
        return
    seen.add(tree.name_full)
    for node in tree.nodes:
        yield node
        if node.bl_idname == "ShaderNodeGroup":
            yield from _all_nodes(node.node_tree, seen)


def _vec(values):
    return [f32(v) for v in values]


def object_data(blender_object):
    """Per-object values, in Blender's own (Z-up, object-local) space."""
    data = {
        "name": blender_object.name,
        "passIndex": blender_object.pass_index,
        "color": _vec(blender_object.color),
        "random": f32(object_random(blender_object.name)),
    }
    mesh = blender_object.data
    if mesh is not None and hasattr(mesh, "texspace_location"):
        # Generated coordinates = (local position - (location - size)) / (2 * size).
        data["texspace"] = {"location": _vec(mesh.texspace_location), "size": _vec(mesh.texspace_size)}
    return data


_MIME = {"PNG": "image/png", "JPEG": "image/jpeg"}


def rgbe_png(image):
    """PNG bytes of a float image in Radiance RGBE: 8-bit mantissas in RGB, a shared exponent
    (+128) in A. Keeps the full range at about 1% precision; alpha and negative values are lost.
    """
    import numpy as np

    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    return rgbe_png_pixels(px.reshape(h, w, 4))


def rgbe_png_pixels(pixels, offset=None):
    """PNG bytes of float pixels (height × width × 4, bottom row first) in Radiance RGBE, after
    subtracting ``offset`` (per rgb channel) when it is given. See rgbe_png."""
    import numpy as np

    h, w = pixels.shape[:2]
    rgb = pixels.reshape(-1, 4)[:, :3].astype(np.float32)
    if offset is not None:
        rgb = rgb - np.asarray(offset, dtype=np.float32)
    rgb = np.maximum(rgb, 0.0)
    peak = rgb.max(axis=1)
    mantissa, exponent = np.frexp(peak)  # peak = mantissa · 2^exponent, mantissa in [0.5, 1)
    visible = peak > 1e-32
    scale = np.where(visible, mantissa * 256.0 / np.where(visible, peak, 1.0), 0.0)
    out = np.zeros((w * h, 4), dtype=np.float32)
    out[:, :3] = np.minimum(np.floor(rgb * scale[:, None]), 255.0)
    out[:, 3] = np.where(visible, exponent + 128, 0)
    return png_pixels((out / 255.0).reshape(h, w, 4))


def png_pixels(pixels):
    """8-bit PNG bytes of float pixels in 0–1 (height × width × 4, bottom row first), written as they
    are (no color management)."""
    import numpy as np

    h, w = pixels.shape[:2]
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "image.png")
        copy = bpy.data.images.new("bsw_png", w, h, alpha=True)
        try:
            copy.colorspace_settings.name = "Non-Color"
            copy.alpha_mode = "CHANNEL_PACKED"
            copy.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
            copy.filepath_raw = path
            copy.file_format = "PNG"
            copy.save()
            with open(path, "rb") as f:
                return f.read()
        finally:
            bpy.data.images.remove(copy)


def rgbe_offset(pixels):
    """Per-channel offset that makes baked pixels non-negative for RGBE, or None if they are."""
    import numpy as np

    low = pixels.reshape(-1, 4)[:, :3].min(axis=0)
    if (low >= 0).all():
        return None
    return [f32(min(0.0, float(np.floor(v * 256.0) / 256.0))) for v in low]


def image_bytes(image):
    """(bytes, mime type, encoding) of a Blender image as PNG or JPEG, without color management.

    Float images become RGBE PNGs (encoding "rgbe"). Packed or on-disk PNG/JPEG files are used as
    they are; anything else (generated, other formats) is saved to a temporary PNG copy.
    """
    if image.is_float:
        return rgbe_png(image), "image/png", "rgbe"
    fmt = image.file_format
    if fmt in _MIME:
        if image.packed_file is not None:
            return bytes(image.packed_file.data), _MIME[fmt], None
        path = bpy.path.abspath(image.filepath_raw or image.filepath)
        if image.source == "FILE" and os.path.isfile(path):
            with open(path, "rb") as f:
                return f.read(), _MIME[fmt], None
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "image.png")
        copy = image.copy()
        try:
            copy.filepath_raw = path
            copy.file_format = "PNG"
            copy.save()
            with open(path, "rb") as f:
                return f.read(), "image/png", None
        finally:
            bpy.data.images.remove(copy)


_IMAGE_NODES = {"ShaderNodeTexImage", "ShaderNodeTexEnvironment"}


class glTF2ExportUserExtension:  # noqa: N801 (name required by io_scene_gltf2)
    def __init__(self):
        from io_scene_gltf2.io.com import gltf2_io
        from io_scene_gltf2.io.com.gltf2_io_extensions import Extension

        try:  # Blender 5.x
            from io_scene_gltf2.io.exp.binary_data import BinaryData
        except ImportError:  # Blender 4.2
            from io_scene_gltf2.io.exp.gltf2_io_binary_data import BinaryData

        self.Extension = Extension
        self.gltf2_io = gltf2_io
        self.BinaryData = BinaryData
        self._graphs = {}
        self._pbr = {}
        self._textures = {}
        self._skies = {}

    def _texture(self, image, export_settings):
        """(glTF texture embedding the image, encoding) shared between materials; None if it fails."""
        key = image.name_full
        if key not in self._textures:
            try:
                data, mime, encoding = image_bytes(image)
            except Exception as error:  # noqa: BLE001  (report and continue the export)
                self._log(export_settings, "warning", f"{EXTENSION_NAME}: cannot embed image '{image.name}': {error}")
                self._textures[key] = None
                return None
            self._textures[key] = (self._gltf_texture(image.name, data, mime), encoding)
        return self._textures[key]

    def _gltf_texture(self, name, data, mime):
        io = self.gltf2_io
        gltf_image = io.Image(
            buffer_view=self.BinaryData(data), extensions=None, extras=None, mime_type=mime, name=name, uri=None
        )
        return io.Texture(extensions=None, extras=None, name=name, sampler=None, source=gltf_image)

    def _sky_image(self, props, export_settings):
        """An image reference to the Sky Texture with these settings, baked to an equirectangular
        RGBE image (shared by identical skies); None if baking fails."""
        key = json.dumps(props, sort_keys=True)
        if key not in self._skies:
            try:
                image = bake_sky(props)
                try:
                    data = rgbe_png(image)
                finally:
                    bpy.data.images.remove(image)
            except Exception as error:  # noqa: BLE001  (report and continue the export)
                self._log(export_settings, "warning", f"{EXTENSION_NAME}: cannot bake the Sky Texture: {error}")
                self._skies[key] = None
                return None
            self._skies[key] = self._gltf_texture("Sky Texture", data, "image/png")
        texture = self._skies[key]
        if texture is None:
            return None
        return {
            "name": "Sky Texture",
            "source": "GENERATED",
            "colorspace": "Linear Rec.709",
            "alphaMode": "NONE",
            "texture": texture,
            "encoding": "rgbe",
        }

    def _bake(self, material, graph, report, export_settings):
        """Bake the material's unsupported node outputs into embedded textures (when enabled)."""
        options = export_settings_module.get()
        if not options.bake_unsupported:
            return

        def embed(name, pixels):
            offset = rgbe_offset(pixels)
            texture = self._gltf_texture(name, rgbe_png_pixels(pixels, offset), "image/png")
            ref = {"texture": texture, "encoding": "rgbe"}
            if offset is not None:
                ref["offset"] = offset
            return ref

        try:
            baked, warnings = bake_unsupported(material, graph, report, bpy.context.scene, options, embed)
        except Exception as error:  # noqa: BLE001  (report and continue the export)
            self._log(export_settings, "warning", f"{EXTENSION_NAME}: cannot bake '{material.name}': {error}")
            return
        for warning in warnings:
            self._log(export_settings, "warning", f"{EXTENSION_NAME}: {warning}")
        if baked:
            self._log(
                export_settings,
                "info",
                f"{EXTENSION_NAME}: material '{material.name}': baked {', '.join(baked)}",
            )

    def _embed_images(self, graph, owner, export_settings):
        """Point every Image / Environment Texture node at an embedded glTF texture, and bake Sky
        Textures to embedded equirectangular images."""
        images = {}
        for tree_node in _all_nodes(owner.node_tree):
            if tree_node.bl_idname in _IMAGE_NODES and tree_node.image is not None:
                images[tree_node.image.name] = tree_node.image
        for node in graph["nodes"].values():
            if node["type"] == "ShaderNodeTexSky":
                sky = self._sky_image(node.get("properties", {}), export_settings)
                if sky is not None:
                    node.setdefault("properties", {})["image"] = sky
                continue
            ref = node.get("properties", {}).get("image")
            if node["type"] not in _IMAGE_NODES or not ref or "baked" in node or ref["name"] not in images:
                continue
            embedded = self._texture(images[ref["name"]], export_settings)
            if embedded is not None:
                ref["texture"], encoding = embedded
                if encoding:
                    ref["encoding"] = encoding

    def _log(self, export_settings, level, message):
        log = export_settings.get("log")
        if log is not None:
            getattr(log, level)(message)
        else:
            print(f"[{EXTENSION_NAME}] {message}")

    def gather_material_hook(self, gltf2_material, blender_material, export_settings):
        if blender_material is None:
            return
        options = export_settings_module.get()
        key = blender_material.name_full
        if key not in self._graphs:
            graph, report = export_material_graph(blender_material)
            self._graphs[key] = graph
            for warning in report["warnings"]:
                self._log(export_settings, "warning", warning)
            # The PBR bake routes sockets of the original graph, so it runs before the graph is rewritten.
            if graph is not None and options.bake_pbr:
                self._pbr[key] = self._bake_pbr(blender_material, graph, report, export_settings)
            if graph is not None and options.write_graphs and report["unsupported"]:
                self._bake(blender_material, graph, report, export_settings)
            unsupported = unsupported_nodes(graph) if graph is not None and options.write_graphs else []
            if unsupported:
                names = ", ".join(sorted({u["name"] for u in unsupported}))
                self._log(
                    export_settings,
                    "warning",
                    f"{EXTENSION_NAME}: material '{blender_material.name}' uses nodes the three.js "
                    f"runtime does not evaluate live yet: {names}",
                )
        if self._pbr.get(key) is not None:
            self._apply_pbr(gltf2_material, self._pbr[key])
        graph = self._graphs[key]
        if graph is None or not options.write_graphs:
            return
        self._embed_images(graph, blender_material, export_settings)
        if gltf2_material.extensions is None:
            gltf2_material.extensions = {}
        gltf2_material.extensions[EXTENSION_NAME] = self.Extension(name=EXTENSION_NAME, extension=graph, required=False)

    def _bake_pbr(self, material, graph, report, export_settings):
        """The material baked to glTF PBR fields (a dict of gltf2_io values), or None."""
        try:
            result, warnings = bake_pbr(material, graph, report, bpy.context.scene, export_settings_module.get())
        except Exception as error:  # noqa: BLE001  (report and continue the export)
            self._log(export_settings, "warning", f"{EXTENSION_NAME}: cannot bake '{material.name}' to PBR: {error}")
            return None
        for warning in warnings:
            self._log(export_settings, "warning", f"{EXTENSION_NAME}: {warning}")
        if result is None:
            return None
        io = self.gltf2_io
        uv_index = 0
        if result["uvMap"] is not None:
            users = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.uv_layers]
            for obj in users:
                index = obj.data.uv_layers.find(result["uvMap"])
                if index >= 0 and any(slot.material == material for slot in obj.material_slots):
                    uv_index = index
                    break

        def info(name, pixels, normal=False):
            texture = self._gltf_texture(f"{material.name} {name}", png_pixels(pixels), "image/png")
            if normal:
                return io.MaterialNormalTextureInfoClass(
                    extensions=None, extras=None, index=texture, scale=None, tex_coord=uv_index or None
                )
            return io.TextureInfo(extensions=None, extras=None, index=texture, tex_coord=uv_index or None)

        fields = {
            "pbr": io.MaterialPBRMetallicRoughness(
                base_color_factor=result.get("baseFactor"),
                base_color_texture=info("base color", result["base"]) if "base" in result else None,
                extensions=None,
                extras=None,
                metallic_factor=result.get("metallicFactor"),
                metallic_roughness_texture=(
                    info("metallic roughness", result["metallicRoughness"]) if "metallicRoughness" in result else None
                ),
                roughness_factor=result.get("roughnessFactor"),
            ),
            "normal": info("normal", result["normal"], normal=True) if "normal" in result else None,
            "emissive": info("emission", result["emissive"]) if "emissive" in result else None,
            "emissiveFactor": result.get("emissiveFactor"),
            "emissiveStrength": result.get("emissiveStrength"),
            "blend": result.get("blend", False),
        }
        self._log(export_settings, "info", f"{EXTENSION_NAME}: material '{material.name}' baked to PBR")
        return fields

    def _apply_pbr(self, gltf2_material, fields):
        """Replace the standard material's PBR values by the baked ones."""
        gltf2_material.pbr_metallic_roughness = fields["pbr"]
        gltf2_material.normal_texture = fields["normal"]
        gltf2_material.occlusion_texture = None
        gltf2_material.emissive_texture = fields["emissive"]
        gltf2_material.emissive_factor = fields["emissiveFactor"]
        gltf2_material.alpha_mode = "BLEND" if fields["blend"] else None
        gltf2_material.alpha_cutoff = None
        extensions = dict(gltf2_material.extensions or {})
        extensions.pop("KHR_materials_emissive_strength", None)
        strength = fields["emissiveStrength"]
        if strength is not None and strength > 1.0:
            extensions["KHR_materials_emissive_strength"] = self.Extension(
                name="KHR_materials_emissive_strength", extension={"emissiveStrength": strength}, required=False
            )
        gltf2_material.extensions = extensions or None

    def gather_scene_hook(self, gltf2_scene, blender_scene, export_settings):
        """The scene's World node tree, as {"world": graph} on the glTF scene."""
        world = getattr(blender_scene, "world", None)
        if world is None or not export_settings_module.get().write_graphs:
            return
        graph, report = export_world_graph(world)
        for warning in report["warnings"]:
            self._log(export_settings, "warning", warning)
        if graph is None:
            return
        if report["unsupported"]:
            names = ", ".join(sorted({u["name"] for u in report["unsupported"]}))
            self._log(
                export_settings,
                "warning",
                f"{EXTENSION_NAME}: world '{world.name}' uses nodes the three.js runtime does not "
                f"evaluate live yet: {names}",
            )
        self._embed_images(graph, world, export_settings)
        if gltf2_scene.extensions is None:
            gltf2_scene.extensions = {}
        gltf2_scene.extensions[EXTENSION_NAME] = self.Extension(
            name=EXTENSION_NAME, extension={"world": graph}, required=False
        )

    def gather_node_hook(self, gltf2_node, blender_object, export_settings):
        if blender_object is None or not isinstance(blender_object, bpy.types.Object):
            return
        if blender_object.type not in {"MESH", "CURVE", "SURFACE", "META", "FONT"}:
            return
        if not export_settings_module.get().write_graphs:
            return
        data = object_data(blender_object)
        colors = self._color_attributes(gltf2_node, blender_object, export_settings)
        if colors:
            data["colorAttributes"] = colors
        if gltf2_node.extensions is None:
            gltf2_node.extensions = {}
        gltf2_node.extensions[EXTENSION_NAME] = self.Extension(
            name=EXTENSION_NAME, extension={"object": data}, required=False
        )

    def _color_attributes(self, gltf2_node, blender_object, export_settings):
        """Which glTF COLOR_n each Blender color attribute became.

        Blender's glTF exporter writes the color attribute the standard material uses as COLOR_0,
        or, when it sees none (as for procedural graphs), a placeholder white COLOR_0, then the
        remaining attributes in order. Counting the exported COLOR_n tells the two cases apart.
        """
        mesh = getattr(blender_object, "data", None)
        names = [a.name for a in getattr(mesh, "color_attributes", [])]
        gltf_mesh = getattr(gltf2_node, "mesh", None)
        if not names or gltf_mesh is None:
            return None
        exported = set()
        for prim in gltf_mesh.primitives or []:
            exported |= {k for k in (prim.attributes or {}) if k.startswith("COLOR_")}
        count = len(exported)
        if count == 0:
            return None
        if count == len(names) + 1:
            indices = list(range(1, len(names) + 1))
        else:
            indices = list(range(len(names)))
            if len(names) > 1:
                self._log(
                    export_settings,
                    "warning",
                    f"{EXTENSION_NAME}: '{blender_object.name}': cannot tell which color attribute "
                    "the glTF exporter wrote first; assuming their order",
                )
        render_index = getattr(mesh.color_attributes, "render_color_index", -1)
        result = {"layers": [{"name": n, "index": i} for n, i in zip(names, indices, strict=True) if i < count]}
        if 0 <= render_index < len(names):
            result["render"] = names[render_index]
        return result
