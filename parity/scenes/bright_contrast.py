"""Brightness −0.2, Contrast 0.6 on a color gradient (0–1.5)."""

from _common import emission_material, gradient_color


def build():
    mat, nodes, links, color_in = emission_material("bright_contrast")
    node = nodes.new("ShaderNodeBrightContrast")
    node.inputs["Bright"].default_value = -0.2
    node.inputs["Contrast"].default_value = 0.6
    links.new(gradient_color(nodes, links), node.inputs["Color"])
    links.new(node.outputs["Color"], color_in)
    return mat
