"""Normal Map in every space, from a smooth 32×32 Non-Color image on the plane's UV map.

The result is shown as n × 0.5 + 0.5. OBJECT / BLENDER_OBJECT use a plane rotated 0.5 rad about Z,
so object and world space differ.
"""

import math

import bpy
from _common import emission_material

VARIANTS = ["TANGENT", "TANGENT_HALF", "OBJECT", "WORLD", "BLENDER_OBJECT", "BLENDER_WORLD"]


def setup(plane, variant):
    if "OBJECT" in variant:
        plane.rotation_euler = (0.0, 0.0, 0.5)


def normal_image():
    image = bpy.data.images.new("NormalMap", 32, 32)
    pixels = []
    for y in range(32):
        for x in range(32):
            u, v = x / 31, y / 31
            nx, ny = 0.45 * math.sin(2 * math.pi * u), 0.45 * math.cos(3 * math.pi * v)
            nz = math.sqrt(max(0.0, 1 - nx * nx - ny * ny))
            pixels += [0.5 + 0.5 * nx, 0.5 + 0.5 * ny, 0.5 + 0.5 * nz, 1.0]
    image.pixels = pixels
    image.colorspace_settings.name = "Non-Color"
    image.pack()
    return image


def build(variant):
    mat, nodes, links, color_in = emission_material("normal_map")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = normal_image()
    node = nodes.new("ShaderNodeNormalMap")
    node.space = "TANGENT" if variant.startswith("TANGENT") else variant
    if variant == "TANGENT_HALF":
        node.inputs["Strength"].default_value = 0.5
    links.new(tex.outputs["Color"], node.inputs["Color"])
    remap = nodes.new("ShaderNodeVectorMath")
    remap.operation = "MULTIPLY_ADD"
    remap.inputs[1].default_value = (0.5, 0.5, 0.5)
    remap.inputs[2].default_value = (0.5, 0.5, 0.5)
    links.new(node.outputs["Normal"], remap.inputs[0])
    links.new(remap.outputs[0], color_in)
    return mat
