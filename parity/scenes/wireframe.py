"""Wireframe (world-size, Size 0.04) on a flat 6×6 grid and on a bumpy 8×8 heightfield.

The output is 0 or 1 with hard edges, so most differences are anti-aliasing at the wire edges
(Cycles' random samples vs the browser's 4×4 grid): the thresholds allow many such pixels, and the
wire coverage matches to within 0.5%. Pixel Size is not compared: the browser renders at 4× the
reference resolution, so a pixel there is a quarter of a reference pixel.
"""

import math

import bpy
from _common import emission_material

VARIANTS = ["GRID", "BUMPY"]


def height(x, y):
    return 0.45 * math.sin(2.2 * x + 0.4) * math.cos(1.7 * y - 0.3)


def setup(plane, variant):
    n = 8 if variant == "BUMPY" else 6
    z = height if variant == "BUMPY" else (lambda x, y: 0.0)
    verts = [(x, y, z(x, y)) for j in range(n + 1) for i in range(n + 1) for x, y in [(-1 + 2 * i / n, -1 + 2 * j / n)]]
    faces = [(j * (n + 1) + i, j * (n + 1) + i + 1, (j + 1) * (n + 1) + i + 1, (j + 1) * (n + 1) + i)
             for j in range(n) for i in range(n)]  # fmt: skip
    mesh = bpy.data.meshes.new("Grid")
    mesh.from_pydata(verts, [], faces)
    for material in plane.data.materials:
        mesh.materials.append(material)
    plane.data = mesh


def build(variant):
    mat, nodes, links, color_in = emission_material("wireframe")
    node = nodes.new("ShaderNodeWireframe")
    node.use_pixel_size = False
    node.inputs["Size"].default_value = 0.04
    links.new(node.outputs["Fac"], color_in)
    return mat
