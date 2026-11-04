"""RGB Curves on colorful gradients (values above 1): combined + per-channel points.

EXTRAPOLATED (default) and HORIZONTAL extend; Fac 1 and 0.5.
"""

from _common import emission_material, two_colors

VARIANTS = ["EXTRAPOLATED", "HORIZONTAL", "HALF"]


def build(variant):
    mat, nodes, links, color_in = emission_material("rgb_curves")
    a, _ = two_colors(nodes, links)
    node = nodes.new("ShaderNodeRGBCurve")
    m = node.mapping
    m.curves[3].points.new(0.3, 0.6)
    m.curves[0].points.new(0.5, 0.2)
    m.curves[1].points.new(0.7, 0.9)
    m.curves[2].points[1].location = (0.8, 1.0)
    m.extend = "HORIZONTAL" if variant == "HORIZONTAL" else "EXTRAPOLATED"
    m.update()
    node.inputs["Fac"].default_value = 0.5 if variant == "HALF" else 1.0
    links.new(a, node.inputs["Color"])
    links.new(node.outputs["Color"], color_in)
    return mat
