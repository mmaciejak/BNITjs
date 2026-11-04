"""Generated → Mapping (POINT) with rotation on all axes → Emission."""

from _common import mapping_material


def build():
    return mapping_material(
        "mapping_point", "POINT", location=(0.1, -0.2, 0.3), rotation=(0.3, 0.5, 0.7), scale=(1.5, 0.75, 2.0)
    )
