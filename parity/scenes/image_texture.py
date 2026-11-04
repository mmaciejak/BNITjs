"""Image Texture: a 16×16 packed image (32 px per texel on screen).

Interpolation Linear/Closest; extensions Repeat/Extend/Mirror/Clip on UV × 2.5 − 0.7; Sphere and
Tube projections on Generated; Non-Color data; and the Alpha output.
"""

import bpy
from _common import emission_material

VARIANTS = ["LINEAR", "CLOSEST", "REPEAT", "EXTEND", "MIRROR", "CLIP", "SPHERE", "TUBE", "NONCOLOR", "ALPHA"]


def make_image():
    image = bpy.data.images.new("Texels", 16, 16, alpha=True)
    pixels = []
    for y in range(16):
        for x in range(16):
            pixels += [x / 15, y / 15, ((x * 7 + y * 3) % 16) / 15, 0.2 + 0.8 * ((x + y) % 5) / 4]
    image.pixels = pixels
    image.pack()
    return image


def build(variant):
    mat, nodes, links, color_in = emission_material("image_texture")
    image = make_image()
    if variant == "NONCOLOR":
        image.colorspace_settings.name = "Non-Color"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest" if variant == "CLOSEST" else "Linear"
    if variant in ("REPEAT", "EXTEND", "MIRROR", "CLIP"):
        tex.extension = variant
        coord = nodes.new("ShaderNodeTexCoord")
        m = nodes.new("ShaderNodeMapping")
        m.inputs["Scale"].default_value = (2.5, 2.5, 1.0)
        m.inputs["Location"].default_value = (-0.7, -0.7, 0.0)
        links.new(coord.outputs["UV"], m.inputs["Vector"])
        links.new(m.outputs["Vector"], tex.inputs["Vector"])
    elif variant in ("SPHERE", "TUBE"):
        tex.projection = variant
        coord = nodes.new("ShaderNodeTexCoord")
        links.new(coord.outputs["Generated"], tex.inputs["Vector"])
    links.new(tex.outputs["Alpha" if variant == "ALPHA" else "Color"], color_in)
    return mat
