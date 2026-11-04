"""Combine Color (RGB, HSV, HSL) from Generated x, y and 0.8 → Emission."""

from _common import emission_material

VARIANTS = ["RGB", "HSV", "HSL"]


def build(variant):
    mat, nodes, links, color_in = emission_material("combine_color")
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    node = nodes.new("ShaderNodeCombineColor")
    node.mode = variant
    links.new(sep.outputs["X"], node.inputs["Red"])
    links.new(sep.outputs["Y"], node.inputs["Green"])
    node.inputs["Blue"].default_value = 0.8
    links.new(node.outputs["Color"], color_in)
    return mat
