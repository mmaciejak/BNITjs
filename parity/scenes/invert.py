"""Invert Color with Fac 1 and 0.5 on a color gradient (0–1.5)."""

from _common import emission_material, gradient_color

VARIANTS = ["FULL", "HALF"]


def build(variant):
    mat, nodes, links, color_in = emission_material("invert")
    node = nodes.new("ShaderNodeInvert")
    node.inputs["Fac"].default_value = 0.5 if variant == "HALF" else 1.0
    links.new(gradient_color(nodes, links), node.inputs["Color"])
    links.new(node.outputs["Color"], color_in)
    return mat
