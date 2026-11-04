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

    def _lookup(self, table, x, extrapolate):
        """Cycles' rgb_ramp_lookup on one channel of the exported table."""
        lo, hi = table["range"]
        n, k = table["size"], len(table["values"]) // table["size"]
        vals = table["values"]

        def entry(i, c):
            return vals[i * k + c]

        f = (x - lo) / (hi - lo)
        out = []
        for c in range(k):
            if extrapolate and (f < 0 or f > 1):
                if f < 0:
                    t0, dy, g = entry(0, c), entry(0, c) - entry(1, c), -f
                else:
                    t0, dy, g = entry(n - 1, c), entry(n - 1, c) - entry(n - 2, c), f - 1
                out.append(t0 + dy * g * (n - 1))
                continue
            g = min(max(f, 0.0), 1.0) * (n - 1)
            i = min(int(g), n - 1)
            frac = g - i
            v = entry(i, c)
            if frac > 0:
                v = v + (entry(i + 1, c) - v) * frac
            out.append(v)
        return out

    def test_vector_curves_table(self):
        node = self.tree.nodes.new("ShaderNodeVectorCurve")
        node.mapping.curves[0].points.new(0.2, -0.6)
        data = sampling.curve_mapping(node.mapping, "VECTOR")
        table = data["table"]
        self.assertEqual(table["range"], [-1.0, 1.0])
        self.assertEqual(len(table["values"]), sampling.LUT_SIZE * 3)
        mapping = node.mapping
        for x in (-0.9, -0.3, 0.11, 0.55, 0.97):
            got = self._lookup(table, x, extrapolate=True)
            for c in range(3):
                self.assertAlmostEqual(got[c], mapping.evaluate(mapping.curves[c], x), delta=2e-3)

    def test_rgb_curves_table_composes_combined_curve(self):
        node = self.tree.nodes.new("ShaderNodeRGBCurve")
        node.mapping.curves[3].points.new(0.3, 0.7)  # C (combined)
        node.mapping.curves[0].points.new(0.6, 0.4)  # R
        data = sampling.curve_mapping(node.mapping, "RGB")
        mapping = node.mapping
        mapping.initialize()
        for x in (0.1, 0.45, 0.8):
            got = self._lookup(data["table"], x, extrapolate=True)
            c = mapping.evaluate(mapping.curves[3], x)
            for k in range(3):
                self.assertAlmostEqual(got[k], mapping.evaluate(mapping.curves[k], c), delta=3e-3)

    def test_float_curve_extrapolates_from_table_ends(self):
        node = self.tree.nodes.new("ShaderNodeFloatCurve")
        data = sampling.curve_mapping(node.mapping, "FLOAT")
        self.assertEqual(data["extend"], "EXTRAPOLATED")
        got = self._lookup(data["table"], 1.5, extrapolate=True)
        self.assertAlmostEqual(got[0], 1.5, places=4)  # default curve is the identity

    def test_rgb_curve_levels_only_when_changed(self):
        node = self.tree.nodes.new("ShaderNodeRGBCurve")
        self.assertNotIn("blackLevel", sampling.curve_mapping(node.mapping, "RGB"))
        node.mapping.black_level = (0.1, 0.1, 0.1)
        self.assertEqual(sampling.curve_mapping(node.mapping, "RGB")["blackLevel"], [0.1, 0.1, 0.1])


if __name__ == "__main__":
    unittest.main()
