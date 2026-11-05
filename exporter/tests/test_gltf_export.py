import json
import os
import sys
import tempfile
import unittest

import bpy
import scenes

import exporter
from exporter import graph_export
from exporter.gltf_hooks import EXTENSION_NAME

ADDON_NAME = "bsw_exporter_under_test"


def enable_addon():
    """Make the glTF exporter discover our hooks, as it would for an installed extension."""
    sys.modules[ADDON_NAME] = exporter
    prefs = bpy.context.preferences
    if ADDON_NAME not in prefs.addons:
        prefs.addons.new().module = ADDON_NAME


def disable_addon():
    prefs = bpy.context.preferences
    if ADDON_NAME in prefs.addons:
        prefs.addons.remove(prefs.addons[ADDON_NAME])
    sys.modules.pop(ADDON_NAME, None)


def plane_with(material):
    bpy.ops.mesh.primitive_plane_add(size=2.0)
    obj = bpy.context.active_object
    obj.data.materials.append(material)
    obj.pass_index = 7
    return obj


def export_gltf(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLTF_SEPARATE")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class GltfExportTest(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        enable_addon()
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        disable_addon()

    def test_graph_is_written_to_material_extension(self):
        mat = scenes.uv_mapping()
        plane_with(mat)
        gltf = export_gltf(os.path.join(self.tmp, "uv.gltf"))

        self.assertIn(EXTENSION_NAME, gltf["extensionsUsed"])
        self.assertNotIn(EXTENSION_NAME, gltf.get("extensionsRequired", []))
        (material,) = gltf["materials"]
        self.assertIn("pbrMetallicRoughness", material)  # standard fallback still present
        graph = material["extensions"][EXTENSION_NAME]

        expected, _ = graph_export.export_material_graph(mat)
        # The glTF exporter writes integral floats as ints; compare as JSON numbers.
        self.assertEqual(json.loads(json.dumps(graph)), json.loads(json.dumps(expected)))

    def test_object_data_on_node(self):
        plane_with(scenes.emission_rgb())
        gltf = export_gltf(os.path.join(self.tmp, "obj.gltf"))
        (node,) = (n for n in gltf["nodes"] if "mesh" in n)
        data = node["extensions"][EXTENSION_NAME]["object"]
        self.assertEqual(data["name"], "Plane")
        self.assertEqual(data["passIndex"], 7)
        self.assertEqual(data["texspace"]["size"], [1, 1, 1])
        self.assertAlmostEqual(data["random"], 0.13576, places=4)  # measured in Cycles for "Plane"

    def test_image_texture_is_embedded(self):
        plane_with(scenes.image_texture())
        gltf = export_gltf(os.path.join(self.tmp, "image.gltf"))
        graph = gltf["materials"][0]["extensions"][EXTENSION_NAME]
        (node,) = (n for n in graph["nodes"].values() if n["type"] == "ShaderNodeTexImage")
        ref = node["properties"]["image"]
        self.assertEqual(ref["name"], "Swatch")
        texture = gltf["textures"][ref["texture"]]
        image = gltf["images"][texture["source"]]
        self.assertEqual(image["mimeType"], "image/png")
        self.assertIn("bufferView", image)
        self.assertEqual(node["properties"]["interpolation"], "Closest")

    def test_world_graph_is_written_to_scene_extension(self):
        plane_with(scenes.world_background())
        gltf = export_gltf(os.path.join(self.tmp, "world.gltf"))
        (scene,) = gltf["scenes"]
        graph = scene["extensions"][EXTENSION_NAME]["world"]
        self.assertEqual(graph["kind"], "world")
        self.assertEqual(graph["material"], "Sky")
        self.assertNotIn("materialPassIndex", graph)
        types = {node["type"] for node in graph["nodes"].values()}
        self.assertEqual(
            types, {"ShaderNodeOutputWorld", "ShaderNodeBackground", "ShaderNodeTexGradient", "ShaderNodeTexCoord"}
        )
        self.assertEqual(graph["nodes"][graph["output"]]["type"], "ShaderNodeOutputWorld")

    def test_no_world_no_scene_extension(self):
        plane_with(scenes.emission_rgb())
        bpy.context.scene.world = None
        gltf = export_gltf(os.path.join(self.tmp, "noworld.gltf"))
        self.assertNotIn(EXTENSION_NAME, gltf["scenes"][0].get("extensions", {}))

    def test_float_image_round_trips_through_rgbe(self):
        from exporter.gltf_hooks import image_bytes

        image = bpy.data.images.new("HDR", 8, 4, float_buffer=True)
        values = [0.0, 0.001, 0.25, 0.9, 1.0, 3.5, 17.0, 250.0]
        pixels = []
        for y in range(4):
            for x in range(8):
                pixels += [values[x], values[(x + y) % 8] * 0.5, values[7 - x] * 0.1, 1.0]
        image.pixels = pixels
        data, mime, encoding = image_bytes(image)
        self.assertEqual((mime, encoding), ("image/png", "rgbe"))
        path = os.path.join(self.tmp, "rgbe.png")
        with open(path, "wb") as f:
            f.write(data)
        png = bpy.data.images.load(path)
        png.colorspace_settings.name = "Non-Color"
        got = list(png.pixels)
        for i in range(0, len(pixels), 4):
            e = round(got[i + 3] * 255)
            for c in range(3):
                want = pixels[i + c]
                value = 0.0 if e == 0 else (round(got[i + c] * 255) + 0.5) * 2.0 ** (e - 136)
                # 8-bit mantissas: within 1% of the pixel's largest channel.
                self.assertAlmostEqual(value, want, delta=0.01 * max(pixels[i : i + 3]) + 1e-6)

    def test_every_test_scene_exports(self):
        for build in scenes.ALL:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            enable_addon()
            plane_with(build())
            gltf = export_gltf(os.path.join(self.tmp, f"{build.__name__}.gltf"))
            graph = gltf["materials"][0]["extensions"][EXTENSION_NAME]
            self.assertEqual(graph["material"], build.__name__)


if __name__ == "__main__":
    unittest.main()
