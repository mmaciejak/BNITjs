"""Texture Coordinate Reflection → Emission. Reflection vector, orthographic camera (constant view direction)."""

from _common import texcoord_material


def build():
    return texcoord_material("texcoord_reflection", "Reflection")
