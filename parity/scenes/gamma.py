"""Gamma 2.2 on a color gradient (0–1.5)."""

from _common import emission_material, gradient_color


def build():
    mat, nodes, links, color_in = emission_material("gamma")
    node = nodes.new("ShaderNodeGamma")
    node.inputs["Gamma"].default_value = 2.2
    links.new(gradient_color(nodes, links), node.inputs["Color"])
    links.new(node.outputs["Color"], color_in)
    return mat
