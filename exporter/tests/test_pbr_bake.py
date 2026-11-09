"""Baking materials into the standard glTF PBR material (exporter/pbr_bake.py)."""

import os
import tempfile
import unittest

import bpy
import scenes
from test_bake import image_pixels, small_bakes
from test_gltf_export import disable_addon, enable_addon, export_gltf, plane_with

from exporter import settings
from exporter.gltf_hooks import EXTENSION_NAME


def srgb(v):
    return v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055


def _sock(sockets, identifier):
    return next(s for s in sockets if s.identifier == identifier)


def rgb_node(nodes, color):
    """A Combine Color node: a linked (so baked) constant."""
    node = nodes.new("ShaderNodeCombineColor")
    for i, name in enumerate(("Red", "Green", "Blue")):
        node.inputs[name].default_value = color[i]
    return node.outputs[0]


def value_node(nodes, value):
    node = nodes.new("ShaderNodeMath")
    node.operation = "ADD"
    node.inputs[0].default_value = value
    node.inputs[1].default_value = 0.0
    return node.outputs[0]


def principled_material():
    """Base Color, Roughness and Emission Color linked; Metallic constant 0.25; Strength 3; Bump normal."""
    mat = scenes.new_material("principled")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], nodes["Material Output"].inputs["Surface"])
    links.new(rgb_node(nodes, (0.2, 0.5, 0.8)), bsdf.inputs["Base Color"])
    links.new(value_node(nodes, 0.7), bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.25
    links.new(rgb_node(nodes, (0.1, 0.2, 0.3)), bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 3.0
    bump = nodes.new("ShaderNodeBump")
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["UV"], sep.inputs[0])
    links.new(sep.outputs["X"], _sock(bump.inputs, "Height"))
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def mix_material():
    """Mix Shader of two Diffuse BSDFs: baked from Cycles' passes."""
    mat = scenes.new_material("mix")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    mix = nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = 0.5
    a = nodes.new("ShaderNodeBsdfDiffuse")
    a.inputs["Color"].default_value = (0.8, 0.0, 0.0, 1.0)
    b = nodes.new("ShaderNodeBsdfDiffuse")
    b.inputs["Color"].default_value = (0.0, 0.0, 0.8, 1.0)
    links.new(a.outputs[0], mix.inputs[1])
    links.new(b.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes["Material Output"].inputs["Surface"])
    return mat


class PbrBakeTest(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        enable_addon()
        self.props = small_bakes()
        self.props.bake_pbr = True
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        settings.unregister()
        disable_addon()

    def export(self, name):
        path = os.path.join(self.tmp, name)
        return path, export_gltf(path)

    def center(self, gltf, path, texture_info):
        (w, h), pixels = image_pixels(gltf, path, texture_info["index"])
        i = ((h // 2) * w + w // 2) * 4
        return pixels[i : i + 4]

    def test_principled_inputs_become_textures_and_factors(self):
        plane_with(principled_material())
        path, gltf = self.export("principled.gltf")
        (material,) = gltf["materials"]
        self.assertIn(EXTENSION_NAME, material["extensions"])  # graphs are still written
        pbr = material["pbrMetallicRoughness"]
        base = self.center(gltf, path, pbr["baseColorTexture"])
        for got, want in zip(base[:3], (0.2, 0.5, 0.8), strict=True):
            self.assertAlmostEqual(got, srgb(want), delta=2 / 255)
        mr = self.center(gltf, path, pbr["metallicRoughnessTexture"])
        self.assertAlmostEqual(mr[1], 0.7, delta=2 / 255)
        self.assertAlmostEqual(mr[2], 0.25, delta=2 / 255)
        self.assertNotIn("baseColorFactor", pbr)
        # Emission 3 × (0.1, 0.2, 0.3) peaks at 0.9: no strength extension, texture as is.
        self.assertNotIn("KHR_materials_emissive_strength", material["extensions"])
        self.assertEqual(material["emissiveFactor"], [1, 1, 1])
        emissive = self.center(gltf, path, material["emissiveTexture"])
        for got, want in zip(emissive[:3], (0.3, 0.6, 0.9), strict=True):
            self.assertAlmostEqual(got, srgb(want), delta=2 / 255)
        self.assertIn("normalTexture", material)
        self.assertNotIn("alphaMode", material)

    def test_constants_become_factors(self):
        mat = scenes.new_material("flat")
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (0.1, 0.2, 0.3, 1.0)
        bsdf.inputs["Alpha"].default_value = 0.5
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.5, 0.0, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 4.0
        links.new(bsdf.outputs[0], nodes["Material Output"].inputs["Surface"])
        plane_with(mat)
        _, gltf = self.export("flat.gltf")
        (material,) = gltf["materials"]
        pbr = material["pbrMetallicRoughness"]
        self.assertEqual([round(v, 4) for v in pbr["baseColorFactor"]], [0.1, 0.2, 0.3, 0.5])
        self.assertNotIn("baseColorTexture", pbr)
        self.assertEqual(material["alphaMode"], "BLEND")
        self.assertEqual([round(v, 4) for v in material["emissiveFactor"]], [1.0, 0.5, 0.0])
        self.assertEqual(material["extensions"]["KHR_materials_emissive_strength"]["emissiveStrength"], 4)
        self.assertNotIn("normalTexture", material)

    def test_other_shaders_use_cycles_passes(self):
        plane_with(mix_material())
        path, gltf = self.export("mix.gltf")
        pbr = gltf["materials"][0]["pbrMetallicRoughness"]
        base = self.center(gltf, path, pbr["baseColorTexture"])
        for got, want in zip(base[:3], (0.4, 0.0, 0.4), strict=True):
            self.assertAlmostEqual(got, srgb(want), delta=3 / 255)

    def test_plain_gltf_without_graphs(self):
        self.props.write_graphs = False
        plane_with(principled_material())
        _, gltf = self.export("plain.gltf")
        self.assertNotIn(EXTENSION_NAME, gltf.get("extensionsUsed", []))
        self.assertIn("baseColorTexture", gltf["materials"][0]["pbrMetallicRoughness"])
        for node in gltf["nodes"]:
            self.assertNotIn(EXTENSION_NAME, node.get("extensions", {}))

    def test_baked_node_feeding_principled(self):
        """The PBR bake routes the original sockets, before Ambient Occlusion is replaced."""
        mat = scenes.baked_node()
        plane_with(mat)
        path, gltf = self.export("ao.gltf")
        (material,) = gltf["materials"]
        graph = material["extensions"][EXTENSION_NAME]
        self.assertTrue(any("baked" in n for n in graph["nodes"].values()))
        base = self.center(gltf, path, material["pbrMetallicRoughness"]["baseColorTexture"])
        self.assertGreater(base[0], 0.9)  # AO Color defaults to white; a lone plane is unoccluded


if __name__ == "__main__":
    unittest.main()
