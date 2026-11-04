import unittest

import bpy
import scenes

import exporter
from exporter import ui


class RegisterTest(unittest.TestCase):
    def test_register_unregister_roundtrip(self):
        exporter.register()
        self.assertTrue(hasattr(bpy.types, "BSW_PT_material"))
        exporter.unregister()
        self.assertFalse(hasattr(bpy.types, "BSW_PT_material"))

    def test_runs_on_supported_blender(self):
        self.assertGreaterEqual(bpy.app.version, (4, 2, 0))


class PanelSummaryTest(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)

    def test_summary_lists_unsupported_nodes(self):
        live, rows, warnings = ui.summarize(scenes.baked_node())
        self.assertEqual(warnings, [])
        self.assertIn(("Ambient Occlusion", 1, "baked"), rows)
        # Material Output, Principled BSDF: whatever is live now, the counts add up.
        self.assertEqual(live + sum(n for _, n, _ in rows), 3)

    def test_summary_without_output(self):
        mat = scenes.new_material("empty")
        mat.node_tree.nodes.clear()
        live, rows, warnings = ui.summarize(mat)
        self.assertIsNone(live)
        self.assertTrue(warnings)


if __name__ == "__main__":
    unittest.main()
