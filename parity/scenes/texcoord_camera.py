"""Texture Coordinate Camera → Emission. Camera coordinates through an orthographic camera (+Z in front)."""

from _common import texcoord_material


def build():
    return texcoord_material("texcoord_camera", "Camera")
