"""Hooks for Blender's bundled glTF exporter (io_scene_gltf2).

The glTF exporter looks for a ``glTF2ExportUserExtension`` class on every enabled add-on and
calls its hooks during export. This module adds:

- ``EXT_blender_shader_graph`` on each material: the flattened node graph. The standard glTF
  PBR material that the exporter writes stays in place as the fallback for viewers that don't
  know the extension, so the extension is never marked required.
- ``EXT_blender_shader_graph`` on each node that has a mesh: per-object data that Blender
  inputs need (Object Info, Generated texture coordinates).
"""

import bpy

from .graph_export import export_material_graph
from .values import f32

EXTENSION_NAME = "EXT_blender_shader_graph"


def _vec(values):
    return [f32(v) for v in values]


def object_data(blender_object):
    """Per-object values, in Blender's own (Z-up, object-local) space."""
    data = {
        "name": blender_object.name,
        "passIndex": blender_object.pass_index,
        "color": _vec(blender_object.color),
    }
    mesh = blender_object.data
    if mesh is not None and hasattr(mesh, "texspace_location"):
        # Generated coordinates = (local position - (location - size)) / (2 * size).
        data["texspace"] = {"location": _vec(mesh.texspace_location), "size": _vec(mesh.texspace_size)}
    return data


class glTF2ExportUserExtension:  # noqa: N801 (name required by io_scene_gltf2)
    def __init__(self):
        from io_scene_gltf2.io.com.gltf2_io_extensions import Extension

        self.Extension = Extension
        self._graphs = {}

    def _log(self, export_settings, level, message):
        log = export_settings.get("log")
        if log is not None:
            getattr(log, level)(message)
        else:
            print(f"[{EXTENSION_NAME}] {message}")

    def gather_material_hook(self, gltf2_material, blender_material, export_settings):
        if blender_material is None:
            return
        key = blender_material.name_full
        if key not in self._graphs:
            graph, report = export_material_graph(blender_material)
            self._graphs[key] = graph
            for warning in report["warnings"]:
                self._log(export_settings, "warning", warning)
            if graph is not None and report["unsupported"]:
                names = ", ".join(sorted({u["name"] for u in report["unsupported"]}))
                self._log(
                    export_settings,
                    "warning",
                    f"{EXTENSION_NAME}: material '{blender_material.name}' uses nodes the three.js "
                    f"runtime does not evaluate live yet: {names}",
                )
        graph = self._graphs[key]
        if graph is None:
            return
        if gltf2_material.extensions is None:
            gltf2_material.extensions = {}
        gltf2_material.extensions[EXTENSION_NAME] = self.Extension(name=EXTENSION_NAME, extension=graph, required=False)

    def gather_node_hook(self, gltf2_node, blender_object, export_settings):
        if blender_object is None or not isinstance(blender_object, bpy.types.Object):
            return
        if blender_object.type not in {"MESH", "CURVE", "SURFACE", "META", "FONT"}:
            return
        if gltf2_node.extensions is None:
            gltf2_node.extensions = {}
        gltf2_node.extensions[EXTENSION_NAME] = self.Extension(
            name=EXTENSION_NAME, extension={"object": object_data(blender_object)}, required=False
        )
