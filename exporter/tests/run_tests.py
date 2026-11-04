"""Run the exporter unit tests inside background Blender.

    blender -b --factory-startup --python exporter/tests/run_tests.py

Exits with status 1 if any test fails, so CI can use it directly.
"""

import os
import sys
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(TESTS_DIR))

# Make `import exporter` work without installing the extension.
sys.path.insert(0, REPO_ROOT)

suite = unittest.defaultTestLoader.discover(TESTS_DIR, pattern="test_*.py", top_level_dir=TESTS_DIR)
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
