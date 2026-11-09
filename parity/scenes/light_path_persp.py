"""Light Path's Ray Length through a perspective camera (× 0.5 − 0.8), as light_path."""

from light_path import build as _build

CAMERA = "PERSP"


def build():
    return _build("RAY_LENGTH")
