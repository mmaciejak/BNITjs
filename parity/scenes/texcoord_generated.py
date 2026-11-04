"""Texture Coordinate Generated → Emission. Generated coordinates on an enlarged, offset mesh."""

from _common import enlarge_and_offset, texcoord_material


def build():
    return texcoord_material("texcoord_generated", "Generated")


def setup(plane):
    enlarge_and_offset(plane)
