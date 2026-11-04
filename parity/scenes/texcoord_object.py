"""Texture Coordinate Object → Emission. Object coordinates on an enlarged, offset mesh."""

from _common import enlarge_and_offset, texcoord_material


def build():
    return texcoord_material("texcoord_object", "Object")


def setup(plane):
    enlarge_and_offset(plane)
