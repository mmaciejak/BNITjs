"""Separate Color (RGB, HSV, HSL) of a colorful gradient, recombined as (r, g, b) → Emission."""

from _common import emission_material, two_colors

VARIANTS = ["RGB", "HSV", "HSL"]


def build(variant):
    mat, nodes, links, color_in = emission_material("separate_color")
    a, _ = two_colors(nodes, links)
    node = nodes.new("ShaderNodeSeparateColor")
    node.mode = variant
    links.new(a, node.inputs["Color"])
    comb = nodes.new("ShaderNodeCombineXYZ")
    for src, dst in zip(("Red", "Green", "Blue"), "XYZ", strict=True):
        links.new(node.outputs[src], comb.inputs[dst])
    links.new(comb.outputs["Vector"], color_in)
    return mat
