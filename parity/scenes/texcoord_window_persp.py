"""Texture Coordinate Window → Emission. Window coordinates through a perspective camera."""

from _common import texcoord_material

CAMERA = "PERSP"


def build():
    return texcoord_material("texcoord_window_persp", "Window")
