import random
import unittest

import bpy
import scenes

from exporter import graph_export, node_support


def links_to(graph, node_id, socket):
    return [tuple(link["from"]) for link in graph.get("links", []) if link["to"] == [node_id, socket]]


def types(graph):
    return sorted(n["type"] for n in graph["nodes"].values())


class GraphExportTest(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)

    def test_simple_graph(self):
        graph, report = graph_export.export_material_graph(scenes.uv_mapping())
        self.assertEqual(graph["version"], 1)
        self.assertEqual(graph["output"], "Material Output")
        self.assertEqual(
            types(graph),
            ["ShaderNodeBsdfPrincipled", "ShaderNodeMapping", "ShaderNodeOutputMaterial", "ShaderNodeTexCoord"],
        )
        self.assertEqual(links_to(graph, "Mapping", "Vector"), [("Texture Coordinate", "UV")])
        self.assertEqual(links_to(graph, "Principled BSDF", "Base Color"), [("Mapping", "Vector")])
        self.assertEqual(links_to(graph, "Material Output", "Surface"), [("Principled BSDF", "BSDF")])
        mapping = graph["nodes"]["Mapping"]
        self.assertEqual(mapping["properties"]["vector_type"], "POINT")
        self.assertEqual(mapping["inputs"]["Location"]["value"], [0.25, 0.5, 0.0])
        self.assertEqual(mapping["inputs"]["Scale"]["value"], [2.0, 3.0, 1.0])
        self.assertEqual(mapping["outputs"]["Vector"]["type"], "VECTOR")
        self.assertEqual(report["warnings"], [])

    def test_value_and_color_nodes_export_their_output_value(self):
        graph, _ = graph_export.export_material_graph(scenes.emission_rgb())
        # The node is named "RGB" in 4.2 and "Color" in 5.x: find it by type.
        (rgb,) = (n for n in graph["nodes"].values() if n["type"] == "ShaderNodeRGB")
        self.assertEqual(rgb["outputs"]["Color"]["value"], [0.8, 0.2, 0.1, 1.0])
        graph, _ = graph_export.export_material_graph(scenes.reroutes_frames_unused())
        self.assertEqual(graph["nodes"]["Value"]["outputs"]["Value"]["value"], 0.42)

    def test_reroutes_frames_and_unused_nodes_are_removed(self):
        graph, _ = graph_export.export_material_graph(scenes.reroutes_frames_unused())
        self.assertNotIn("NodeReroute", types(graph))
        self.assertNotIn("NodeFrame", types(graph))
        self.assertNotIn("ShaderNodeTexNoise", types(graph))
        self.assertEqual(links_to(graph, "Principled BSDF", "Roughness"), [("Value", "Value")])
        self.assertEqual(graph["nodes"]["Value"]["outputs"]["Value"]["type"], "VALUE")
        # The dangling reroute becomes a zero constant of its socket type (a reroute takes the
        # type of what it is connected to: here a float).
        (src,) = links_to(graph, "Principled BSDF", "Metallic")
        const = graph["nodes"][src[0]]
        self.assertEqual(const["type"], graph_export.VALUE_NODE)
        self.assertEqual(const["outputs"]["Value"]["type"], "VALUE")
        self.assertEqual(const["properties"]["value"], 0.0)

    def test_muted_node_passes_through_and_muted_link_is_dropped(self):
        graph, _ = graph_export.export_material_graph(scenes.muted_node_and_link())
        self.assertNotIn("ShaderNodeMix", types(graph))
        self.assertEqual(links_to(graph, "Principled BSDF", "Base Color"), [("A", "Color")])
        self.assertNotIn("B", graph["nodes"])
        self.assertEqual(links_to(graph, "Principled BSDF", "Roughness"), [])
        self.assertNotIn("Value", graph["nodes"])

    def test_nested_groups_are_flattened(self):
        graph, _ = graph_export.export_material_graph(scenes.nested_groups())
        self.assertNotIn("ShaderNodeGroup", types(graph))
        self.assertNotIn("NodeGroupInput", types(graph))
        self.assertIn("Outer/Inner/Math", graph["nodes"])
        math = graph["nodes"]["Outer/Inner/Math"]
        self.assertEqual(math["group"], "Outer/Inner")
        # Linked group input: wired straight through two group levels.
        self.assertEqual(links_to(graph, "Outer/Inner/Math", "Value"), [("Value", "Value")])
        # Group output: wired straight to the consumer.
        self.assertEqual(links_to(graph, "Principled BSDF", "Roughness"), [("Outer/Inner/Math", "Value")])
        # Unlinked group input: becomes a constant carrying the group node's value.
        (src,) = links_to(graph, "Outer/Inner/Separate Color", "Color")
        const = graph["nodes"][src[0]]
        self.assertEqual(const["type"], graph_export.VALUE_NODE)
        self.assertEqual(const["properties"]["value"], [0.5, 0.25, 0.125, 1.0])
        self.assertEqual(const["outputs"]["Value"]["type"], "RGBA")
        self.assertEqual(const["name"], "Inner: Tint")

    def test_color_ramp_is_sampled_exactly(self):
        mat = scenes.ramps_and_curves()
        graph, _ = graph_export.export_material_graph(mat)
        data = graph["nodes"]["Color Ramp"]["data"]["colorRamp"]
        self.assertEqual(data["interpolation"], "EASE")
        self.assertEqual(len(data["elements"]), 3)
        self.assertEqual(len(data["lut"]), data["size"] * 4)
        ramp = mat.node_tree.nodes["Color Ramp"].color_ramp
        for i in (0, 37, 100, 255):
            expected = ramp.evaluate(i / 255)
            for c in range(4):
                self.assertAlmostEqual(data["lut"][i * 4 + c], expected[c], places=6)

    def test_curves_are_sampled_and_interpolate_back(self):
        mat = scenes.ramps_and_curves()
        graph, _ = graph_export.export_material_graph(mat)
        rng = random.Random(1)
        for name in ("Float Curve", "RGB Curves", "Vector Curves"):
            data = graph["nodes"][name]["data"]["curveMapping"]
            mapping = mat.node_tree.nodes[name].mapping
            mapping.initialize()
            for curve, sampled in zip(mapping.curves, data["curves"], strict=True):
                lo, hi = sampled["range"]
                lut = sampled["lut"]
                for _ in range(50):
                    x = rng.uniform(lo, hi)
                    t = (x - lo) / (hi - lo) * (len(lut) - 1)
                    i = min(int(t), len(lut) - 2)
                    approx = lut[i] + (lut[i + 1] - lut[i]) * (t - i)
                    self.assertAlmostEqual(approx, mapping.evaluate(curve, x), delta=2e-3, msg=name)
                # Linear extension outside the range.
                x = hi + 0.5
                approx = lut[-1] + sampled["slopes"][1] * 0.5
                self.assertAlmostEqual(approx, mapping.evaluate(curve, x), delta=1e-3, msg=name)

    def test_report_lists_exactly_the_nodes_not_live(self):
        for build in scenes.ALL:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            graph, report = graph_export.export_material_graph(build())
            expected = {
                node_id
                for node_id, n in graph["nodes"].items()
                if n["type"] != graph_export.VALUE_NODE and node_support.STATUS.get(n["type"]) not in node_support.LIVE
            }
            self.assertEqual({u["id"] for u in report["unsupported"]}, expected, build.__name__)

    def test_report_includes_status(self):
        _, report = graph_export.export_material_graph(scenes.baked_node())
        self.assertIn(("Ambient Occlusion", "baked"), {(u["id"], u["status"]) for u in report["unsupported"]})

    def test_no_empty_collections_or_none(self):
        """The glTF exporter strips them, so the graph must never depend on them."""

        def walk(value, path):
            self.assertIsNotNone(value, path)
            if isinstance(value, dict | list):
                self.assertTrue(len(value) > 0, path)
                items = value.items() if isinstance(value, dict) else enumerate(value)
                for k, v in items:
                    walk(v, f"{path}/{k}")

        for build in scenes.ALL:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            graph, _ = graph_export.export_material_graph(build())
            walk(graph, build.__name__)

    def test_material_without_output(self):
        mat = scenes.new_material("no_output")
        mat.node_tree.nodes.clear()
        graph, report = graph_export.export_material_graph(mat)
        self.assertIsNone(graph)
        self.assertTrue(report["warnings"])


if __name__ == "__main__":
    unittest.main()
