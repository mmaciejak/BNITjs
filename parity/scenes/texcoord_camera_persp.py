"""Texture Coordinate Camera → Emission. Camera coordinates through a perspective camera."""

from _common import texcoord_material

CAMERA = "PERSP"


def build():
    return texcoord_material("texcoord_camera_persp", "Camera")
