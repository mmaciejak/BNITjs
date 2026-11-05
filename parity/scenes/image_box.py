"""Image Texture with Box projection on a smooth, bumpy surface, so the object-space normal turns
towards all three axes. Object coordinates × 0.8 + 0.5 feed the texture; Blend 0 and 0.3.
"""

import math

import bpy
from _common import emission_material
from image_texture import make_image

VARIANTS = ["SHARP", "BLEND"]
N = 48


def setup(plane, variant):
    """Replace the plane by a smooth heightfield over the same 2×2 square."""
    verts, faces = [], []
    for j in range(N + 1):
        for i in range(N + 1):
            x, y = -1 + 2 * i / N, -1 + 2 * j / N
            z = 0.45 * math.sin(2.2 * x + 0.4) * math.cos(1.7 * y - 0.3) + 0.25 * math.sin(3.1 * y)
            verts.append((x, y, z))
    for j in range(N):
        for i in range(N):
            a = j * (N + 1) + i
            faces.append((a, a + 1, a + N + 2, a + N + 1))
    mesh = bpy.data.meshes.new("Bumps")
    mesh.from_pydata(verts, [], faces)
    for poly in mesh.polygons:
        poly.use_smooth = True
    for material in plane.data.materials:
        mesh.materials.append(material)
    plane.data = mesh


def build(variant):
    mat, nodes, links, color_in = emission_material("image_box")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = make_image()
    tex.projection = "BOX"
    tex.projection_blend = 0.3 if variant == "BLEND" else 0.0
    coord = nodes.new("ShaderNodeTexCoord")
    m = nodes.new("ShaderNodeMapping")
    m.inputs["Scale"].default_value = (0.8, 0.8, 0.8)
    m.inputs["Location"].default_value = (0.5, 0.5, 0.5)
    links.new(coord.outputs["Object"], m.inputs["Vector"])
    links.new(m.outputs["Vector"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], color_in)
    return mat
