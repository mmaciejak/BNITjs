"""Texture Coordinate Reflection → Emission. Reflection vector through a perspective camera ."""

from _common import texcoord_material

CAMERA = "PERSP"


def build():
    return texcoord_material("texcoord_reflection_persp", "Reflection")
