"""Export-time baking of nodes the runtime cannot evaluate live (exporter/bake_fallback.py)."""

import math
import os
import tempfile
import unittest

import bpy
import scenes
from test_gltf_export import disable_addon, enable_addon, export_gltf, plane_with

from exporter import bake_fallback, settings
from exporter.gltf_hooks import EXTENSION_NAME


def small_bakes():
    """Register the settings (BakeTest.tearDown unregisters them) and make bakes small and quick."""
    settings.register()
    props = bpy.context.scene.bnitjs_export
    props.bake_resolution = 32
    props.bake_samples = 4
    props.bake_margin = 2
    return props


def ao_material(color, inside_group=False):
    """Ambient Occlusion (Color = ``color``) into an Emission shader, optionally inside a group."""
    mat = scenes.new_material("ao")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    emission = nodes.new("ShaderNodeEmission")
    links.new(emission.outputs[0], nodes["Material Output"].inputs["Surface"])
    if not inside_group:
        ao = nodes.new("ShaderNodeAmbientOcclusion")
        ao.inputs["Color"].default_value = color
        links.new(ao.outputs["Color"], emission.inputs["Color"])
        return mat
    tree = bpy.data.node_groups.new("Occlusion", "ShaderNodeTree")
    tree.interface.new_socket(name="Out", in_out="OUTPUT", socket_type="NodeSocketColor")
    out = tree.nodes.new("NodeGroupOutput")
    ao = tree.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Color"].default_value = color
    tree.links.new(ao.outputs["Color"], out.inputs[0])
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = tree
    links.new(group.outputs[0], emission.inputs["Color"])
    return mat


def bevel_normal_material():
    """Bevel's Normal output into Emission: on a plane facing −Z it is negative."""
    mat = scenes.new_material("bevel")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    emission = nodes.new("ShaderNodeEmission")
    bevel = nodes.new("ShaderNodeBevel")
    links.new(bevel.outputs["Normal"], emission.inputs["Color"])
    links.new(emission.outputs[0], nodes["Material Output"].inputs["Surface"])
    return mat


def image_pixels(gltf, gltf_path, texture_index):
    """Float pixels (bottom row first, rgba) of an embedded PNG texture, read raw."""
    image = gltf["images"][gltf["textures"][texture_index]["source"]]
    view = gltf["bufferViews"][image["bufferView"]]
    buffer = gltf["buffers"][view["buffer"]]
    with open(os.path.join(os.path.dirname(gltf_path), buffer["uri"]), "rb") as f:
        f.seek(view.get("byteOffset", 0))
        data = f.read(view["byteLength"])
    path = os.path.join(os.path.dirname(gltf_path), "texture.png")
    with open(path, "wb") as f:
        f.write(data)
    png = bpy.data.images.load(path)
    png.colorspace_settings.name = "Non-Color"
    return png.size, list(png.pixels)


def decode_rgbe(pixels, i, offset=None):
    e = round(pixels[i + 3] * 255)
    rgb = [0.0 if e == 0 else (round(pixels[i + c] * 255) + 0.5) * 2.0 ** (e - 136) for c in range(3)]
    return [v + o for v, o in zip(rgb, offset or [0, 0, 0], strict=True)]


class BakeTest(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        enable_addon()
        self.props = small_bakes()
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        settings.unregister()
        disable_addon()

    def export(self, name):
        path = os.path.join(self.tmp, name)
        return path, export_gltf(path)

    def baked_node(self, graph):
        (node,) = (n for n in graph["nodes"].values() if "baked" in n)
        return node

    def test_unsupported_output_is_replaced_by_baked_image(self):
        plane_with(ao_material((0.2, 0.5, 0.8, 1.0)))
        path, gltf = self.export("ao.gltf")
        graph = gltf["materials"][0]["extensions"][EXTENSION_NAME]
        types = {n["type"] for n in graph["nodes"].values()}
        self.assertNotIn("ShaderNodeAmbientOcclusion", types)
        node = self.baked_node(graph)
        self.assertEqual(
            node["baked"], {"node": "Ambient Occlusion", "type": "ShaderNodeAmbientOcclusion", "output": "Color"}
        )
        ref = node["properties"]["image"]
        self.assertEqual(ref["encoding"], "rgbe")
        self.assertNotIn("offset", ref)
        # The image is sampled on the UV map it was baked on.
        node_id = next(k for k, v in graph["nodes"].items() if v is node)
        uv_link = next(link for link in graph["links"] if link["to"][0] == node_id)
        self.assertEqual(graph["nodes"][uv_link["from"][0]]["properties"]["uv_map"], "UVMap")
        # A lone plane is not occluded: the bake is the AO node's Color input.
        (w, h), pixels = image_pixels(gltf, path, ref["texture"])
        self.assertEqual((w, h), (32, 32))
        center = ((h // 2) * w + w // 2) * 4
        for got, want in zip(decode_rgbe(pixels, center), (0.2, 0.5, 0.8), strict=True):
            self.assertAlmostEqual(got, want, delta=0.01)

    def test_node_inside_group_is_baked_and_user_data_is_untouched(self):
        mat = ao_material((0.3, 0.3, 0.3, 1.0), inside_group=True)
        obj = plane_with(mat)
        before = (set(bpy.data.materials), set(bpy.data.node_groups), set(bpy.data.objects), set(bpy.data.meshes))
        _, gltf = self.export("group.gltf")
        graph = gltf["materials"][0]["extensions"][EXTENSION_NAME]
        node = self.baked_node(graph)
        self.assertEqual(node["baked"]["node"], "Group/Ambient Occlusion")
        after = (set(bpy.data.materials), set(bpy.data.node_groups), set(bpy.data.objects), set(bpy.data.meshes))
        self.assertEqual(before, after)
        self.assertEqual(len(bpy.data.node_groups["Occlusion"].interface.items_tree), 1)
        self.assertEqual(obj.material_slots[0].material, mat)
        self.assertEqual(len(bpy.data.scenes), 1)

    def test_negative_values_are_stored_with_an_offset(self):
        obj = plane_with(bevel_normal_material())
        obj.rotation_euler = (math.pi, 0.0, 0.0)  # faces −Z
        path, gltf = self.export("bevel.gltf")
        graph = gltf["materials"][0]["extensions"][EXTENSION_NAME]
        ref = self.baked_node(graph)["properties"]["image"]
        self.assertLess(ref["offset"][2], -0.99)
        (w, h), pixels = image_pixels(gltf, path, ref["texture"])
        center = ((h // 2) * w + w // 2) * 4
        for got, want in zip(decode_rgbe(pixels, center, ref["offset"]), (0.0, 0.0, -1.0), strict=True):
            self.assertAlmostEqual(got, want, delta=0.02)

    def test_each_output_gets_its_own_bake(self):
        mat = ao_material((0.2, 0.5, 0.8, 1.0))
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        links.new(nodes["Ambient Occlusion"].outputs["AO"], nodes["Emission"].inputs["Strength"])
        plane_with(mat)
        path, gltf = self.export("two.gltf")
        graph = gltf["materials"][0]["extensions"][EXTENSION_NAME]
        baked = {n["baked"]["output"]: n for n in graph["nodes"].values() if "baked" in n}
        self.assertEqual(set(baked), {"Color", "AO"})
        for output, want in (("Color", (0.2, 0.5, 0.8)), ("AO", (1.0, 1.0, 1.0))):
            (w, h), pixels = image_pixels(gltf, path, baked[output]["properties"]["image"]["texture"])
            center = ((h // 2) * w + w // 2) * 4
            for got, value in zip(decode_rgbe(pixels, center), want, strict=True):
                self.assertAlmostEqual(got, value, delta=0.01, msg=output)

    def test_bake_can_be_turned_off(self):
        self.props.bake_unsupported = False
        plane_with(ao_material((0.2, 0.5, 0.8, 1.0)))
        _, gltf = self.export("off.gltf")
        graph = gltf["materials"][0]["extensions"][EXTENSION_NAME]
        types = {n["type"] for n in graph["nodes"].values()}
        self.assertIn("ShaderNodeAmbientOcclusion", types)

    def test_panel_shows_what_is_baked(self):
        from exporter import ui

        mat = ao_material((0.2, 0.5, 0.8, 1.0))
        self.assertIn(("Ambient Occlusion", 1, "baked"), ui.summarize(mat)[1])
        self.props.bake_unsupported = False
        self.assertIn(("Ambient Occlusion", 1, "bake_off"), ui.summarize(mat)[1])

    def test_material_without_uv_map_is_not_baked(self):
        obj = plane_with(ao_material((0.2, 0.5, 0.8, 1.0)))
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
        _, gltf = self.export("nouv.gltf")
        graph = gltf["materials"][0]["extensions"][EXTENSION_NAME]
        self.assertIn("ShaderNodeAmbientOcclusion", {n["type"] for n in graph["nodes"].values()})


class PruneTest(unittest.TestCase):
    def test_prune_drops_unreachable_nodes_links_and_params(self):
        graph = {
            "output": "out",
            "nodes": {"out": {}, "a": {}, "b": {}, "c": {}},
            "links": [{"from": ["a", "x"], "to": ["out", "y"]}, {"from": ["c", "x"], "to": ["b", "y"]}],
            "params": [{"name": "A", "node": "a"}, {"name": "C", "node": "c"}],
        }
        bake_fallback.prune(graph)
        self.assertEqual(set(graph["nodes"]), {"out", "a"})
        self.assertEqual(graph["links"], [{"from": ["a", "x"], "to": ["out", "y"]}])
        self.assertEqual(graph["params"], [{"name": "A", "node": "a"}])

    def test_targets_skip_shader_outputs_and_live_nodes(self):
        graph = {
            "output": "out",
            "nodes": {
                "out": {"type": "ShaderNodeOutputMaterial"},
                "ao": {
                    "type": "ShaderNodeAmbientOcclusion",
                    "outputs": {"Color": {"type": "RGBA"}, "AO": {"type": "VALUE"}},
                },
                "toon": {"type": "ShaderNodeBsdfToon", "outputs": {"BSDF": {"type": "SHADER"}}},
                "math": {"type": "ShaderNodeMath", "outputs": {"Value": {"type": "VALUE"}}},
            },
            "links": [
                {"from": ["ao", "AO"], "to": ["math", "Value"]},
                {"from": ["ao", "AO"], "to": ["out", "Displacement"]},
                {"from": ["toon", "BSDF"], "to": ["out", "Surface"]},
                {"from": ["math", "Value"], "to": ["out", "Volume"]},
            ],
        }
        self.assertEqual(bake_fallback.bake_targets(graph), [("ao", "AO")])


if __name__ == "__main__":
    unittest.main()
