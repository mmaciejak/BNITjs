"""Texture Coordinate Window → Emission. Window coordinates: (0, 0) bottom left, (1, 1) top right."""

from _common import texcoord_material


def build():
    return texcoord_material("texcoord_window", "Window")
