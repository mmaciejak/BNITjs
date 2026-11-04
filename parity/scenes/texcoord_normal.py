"""Texture Coordinate Normal → Emission. Object-space normal of a flat plane: constant (0, 0, 1)."""

from _common import texcoord_material


def build():
    return texcoord_material("texcoord_normal", "Normal")
