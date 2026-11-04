"""Texture Coordinate UV → Emission. UV map, V flipped back from glTF."""

from _common import texcoord_material


def build():
    return texcoord_material("texcoord_uv", "UV")
