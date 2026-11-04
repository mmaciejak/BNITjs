"""Value → Emission color (float → color implicit conversion)."""

from _common import emission_material


def build():
    mat, nodes, links, color_in = emission_material("value")
    value = nodes.new("ShaderNodeValue")
    value.outputs[0].default_value = 0.3
    links.new(value.outputs[0], color_in)
    return mat
