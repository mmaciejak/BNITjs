"""Sky Texture types of Blender 4.x (rendered with 4.2), baked by the exporter. See world.py."""

from world import CAMERA, CAMERA_ROTATION, build  # noqa: F401
from world import build_world as _world

BLENDER_MAX = (4, 99)
VARIANTS = ["SKY_NISHITA", "SKY_PREETHAM", "SKY_HOSEK_WILKIE"]


def build_world(variant):
    return _world(variant)
