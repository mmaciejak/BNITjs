"""Export every test scene to schema/fixtures/<scene>.gltf (+ .bin).

    blender -b --factory-startup --python exporter/tests/make_fixtures.py

The fixtures are committed. The runtime tests validate them against schema/graph.schema.json
and use them as loader inputs. Regenerate them with the primary Blender version (5.2 LTS)
whenever the export format changes.
"""

import os
import sys

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(TESTS_DIR))
sys.path.insert(0, REPO_ROOT)
sys.path.insert(0, TESTS_DIR)

import bpy  # noqa: E402
import scenes  # noqa: E402
from test_gltf_export import disable_addon, enable_addon, plane_with  # noqa: E402

OUT = os.path.join(REPO_ROOT, "schema", "fixtures")
os.makedirs(OUT, exist_ok=True)

for build in scenes.ALL:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    enable_addon()
    plane_with(build())
    path = os.path.join(OUT, f"{build.__name__}.gltf")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLTF_SEPARATE")
    disable_addon()
    print("wrote", os.path.relpath(path, REPO_ROOT))
