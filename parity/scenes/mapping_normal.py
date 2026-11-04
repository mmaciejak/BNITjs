"""Generated → Mapping (NORMAL) with rotation on all axes → Emission. A zero scale component tests safe division."""

from _common import mapping_material


def build():
    return mapping_material("mapping_normal", "NORMAL", rotation=(0.3, 0.5, 0.7), scale=(1.5, 0.0, 2.0))
