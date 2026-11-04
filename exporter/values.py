"""Small value helpers shared by the exporter modules."""

import struct


def f32(value):
    """Shortest decimal that round-trips to the same float32 (Blender stores floats as float32)."""
    value = float(value)
    if value != value or value in (float("inf"), float("-inf")):
        return 0.0
    packed = struct.pack("<f", value)
    for precision in range(6, 10):
        candidate = float(f"{value:.{precision}g}")
        if struct.pack("<f", candidate) == packed:
            return candidate
    return value
