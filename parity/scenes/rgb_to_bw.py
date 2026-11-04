"""RGB to BW on a color gradient (0–1.5)."""

from _common import emission_material, gradient_color


def build():
    mat, nodes, links, color_in = emission_material("rgb_to_bw")
    node = nodes.new("ShaderNodeRGBToBW")
    links.new(gradient_color(nodes, links), node.inputs["Color"])
    links.new(node.outputs["Val"], color_in)
    return mat
