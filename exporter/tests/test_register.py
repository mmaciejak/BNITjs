import unittest

import bpy

import exporter


class RegisterTest(unittest.TestCase):
    def test_register_unregister_roundtrip(self):
        exporter.register()
        exporter.unregister()

    def test_runs_on_supported_blender(self):
        self.assertGreaterEqual(bpy.app.version, (4, 2, 0))
