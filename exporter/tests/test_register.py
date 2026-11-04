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
        live, rows, warnings = ui.summarize(scenes.uv_mapping())
        self.assertEqual(warnings, [])
        names = {name for name, _, _ in rows}
        self.assertIn("Mapping", names)
        self.assertIn("Principled BSDF", names)
        self.assertEqual(live, 0)  # nothing is live before Phase 2

    def test_summary_without_output(self):
        mat = scenes.new_material("empty")
        mat.node_tree.nodes.clear()
        live, rows, warnings = ui.summarize(mat)
        self.assertIsNone(live)
        self.assertTrue(warnings)


if __name__ == "__main__":
    unittest.main()
