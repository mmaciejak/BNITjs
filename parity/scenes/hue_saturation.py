"""Hue/Saturation/Value on a colorful gradient: a full shift, and Fac 0.5."""

from _common import emission_material, two_colors

VARIANTS = ["SHIFT", "HALF"]


def build(variant):
    mat, nodes, links, color_in = emission_material("hue_saturation")
    a, _ = two_colors(nodes, links)
    node = nodes.new("ShaderNodeHueSaturation")
    node.inputs["Hue"].default_value = 0.8
    node.inputs["Saturation"].default_value = 1.6
    node.inputs["Value"].default_value = 0.85
    node.inputs["Fac"].default_value = 0.5 if variant == "HALF" else 1.0
    links.new(a, node.inputs["Color"])
    links.new(node.outputs["Color"], color_in)
    return mat
