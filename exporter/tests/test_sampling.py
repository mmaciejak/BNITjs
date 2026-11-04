import unittest

import bpy

from exporter import sampling


class SamplingTest(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.tree = bpy.data.node_groups.new("T", "ShaderNodeTree")

    def test_color_ramp_lut_matches_evaluate(self):
        ramp = self.tree.nodes.new("ShaderNodeValToRGB").color_ramp
        ramp.elements.new(0.3).color = (1.0, 0.0, 0.5, 0.5)
        ramp.interpolation = "B_SPLINE"
        data = sampling.color_ramp(ramp)
        self.assertEqual(data["size"], sampling.LUT_SIZE)
        self.assertEqual(len(data["lut"]), sampling.LUT_SIZE * 4)
        self.assertEqual([e["position"] for e in data["elements"]], [0.0, 0.3, 1.0])
        for i in range(0, sampling.LUT_SIZE, 17):
            expected = ramp.evaluate(i / (sampling.LUT_SIZE - 1))
            got = data["lut"][i * 4 : i * 4 + 4]
            for a, b in zip(got, expected, strict=True):
                self.assertAlmostEqual(a, b, places=6)

    def test_curve_mapping_range_and_slopes(self):
        node = self.tree.nodes.new("ShaderNodeVectorCurve")
        data = sampling.curve_mapping(node.mapping)
        self.assertEqual(len(data["curves"]), 3)
        for curve in data["curves"]:
            self.assertEqual(curve["range"], [-1.0, 1.0])
            self.assertEqual(len(curve["lut"]), sampling.LUT_SIZE)
            # Default vector curves are the identity, extrapolated linearly.
            self.assertAlmostEqual(curve["lut"][0], -1.0, places=5)
            self.assertAlmostEqual(curve["lut"][-1], 1.0, places=5)
            self.assertAlmostEqual(curve["slopes"][1], 1.0, places=4)

    def test_horizontal_extend_has_zero_slopes(self):
        node = self.tree.nodes.new("ShaderNodeFloatCurve")
        node.mapping.extend = "HORIZONTAL"
        data = sampling.curve_mapping(node.mapping)
        self.assertEqual(data["extend"], "HORIZONTAL")
        self.assertEqual(data["curves"][0]["slopes"], [0.0, 0.0])

    def test_rgb_curve_levels_only_when_changed(self):
        node = self.tree.nodes.new("ShaderNodeRGBCurve")
        self.assertNotIn("blackLevel", sampling.curve_mapping(node.mapping))
        node.mapping.black_level = (0.1, 0.1, 0.1)
        self.assertEqual(sampling.curve_mapping(node.mapping)["blackLevel"], [0.1, 0.1, 0.1])


if __name__ == "__main__":
    unittest.main()
