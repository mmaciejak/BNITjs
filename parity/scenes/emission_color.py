"""Color node → Emission: a flat color (tests the harness, color management and Emission)."""

from _common import emission_material


def build():
    mat, nodes, links, color_in = emission_material("emission_color")
    rgb = nodes.new("ShaderNodeRGB")
    rgb.outputs[0].default_value = (0.8, 0.2, 0.05, 1.0)
    links.new(rgb.outputs[0], color_in)
    return mat
