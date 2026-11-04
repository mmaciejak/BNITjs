"""Float Curve on Generated x in [-0.5, 1.5]; EXTRAPOLATED and HORIZONTAL; Factor 1 and 0.5."""

from _common import emission_material, show_signed, x_factor

VARIANTS = ["EXTRAPOLATED", "HORIZONTAL", "HALF"]


def build(variant):
    mat, nodes, links, color_in = emission_material("float_curve")
    node = nodes.new("ShaderNodeFloatCurve")
    m = node.mapping
    m.curves[0].points.new(0.3, 0.8)
    m.curves[0].points.new(0.6, 0.2)
    m.extend = "HORIZONTAL" if variant == "HORIZONTAL" else "EXTRAPOLATED"
    m.update()
    node.inputs["Factor"].default_value = 0.5 if variant == "HALF" else 1.0
    links.new(x_factor(nodes, links, -0.5, 1.5), node.inputs["Value"])
    show_signed(nodes, links, node.outputs["Value"], color_in)
    return mat
