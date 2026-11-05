"""Bump: the perturbed normal (× 0.5 + 0.5) for smooth heights on the flat plane.

NOISE: Noise Texture (Scale 3, Detail 1) as height, Distance 0.3. WAVE: a sine of Generated x, so
the gradient is known. STRENGTH / INVERT: half strength, inverted. CURVED: the bumpy heightfield
of image_box (normal varies), perspective camera, noise height.
"""

import math

from _common import by_id, emission_material
from image_box import setup as bumpy

VARIANTS = ["NOISE", "WAVE", "STRENGTH", "INVERT", "CURVED"]


def setup(plane, variant):
    if variant == "CURVED":
        bumpy(plane, variant)


def build(variant):
    mat, nodes, links, color_in = emission_material("bump")
    node = nodes.new("ShaderNodeBump")
    inputs = by_id(node.inputs)
    inputs["Distance"].default_value = 0.3
    if variant == "STRENGTH":
        inputs["Strength"].default_value = 0.5
    node.invert = variant == "INVERT"
    if variant == "WAVE":
        coord = nodes.new("ShaderNodeTexCoord")
        sep = nodes.new("ShaderNodeSeparateXYZ")
        sine = nodes.new("ShaderNodeMath")
        sine.operation = "SINE"
        scale = nodes.new("ShaderNodeMath")
        scale.operation = "MULTIPLY"
        scale.inputs[1].default_value = 2 * math.pi * 1.5
        links.new(coord.outputs["Generated"], sep.inputs["Vector"])
        links.new(sep.outputs["X"], scale.inputs[0])
        links.new(scale.outputs[0], sine.inputs[0])
        height = sine.outputs[0]
        inputs["Distance"].default_value = 0.05
    else:
        noise = nodes.new("ShaderNodeTexNoise")
        by_id(noise.inputs)["Scale"].default_value = 3.0
        by_id(noise.inputs)["Detail"].default_value = 1.0
        height = by_id(noise.outputs)["Fac"]
    links.new(height, inputs["Height"])
    remap = nodes.new("ShaderNodeVectorMath")
    remap.operation = "MULTIPLY_ADD"
    remap.inputs[1].default_value = (0.5, 0.5, 0.5)
    remap.inputs[2].default_value = (0.5, 0.5, 0.5)
    links.new(node.outputs["Normal"], remap.inputs[0])
    links.new(remap.outputs[0], color_in)
    return mat
