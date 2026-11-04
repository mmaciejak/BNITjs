"""Color Ramp: every interpolation, HSV/HSL color modes; Fac = Generated x in [-0.25, 1.25]."""

from _common import emission_material, x_factor

VARIANTS = ["LINEAR", "CONSTANT", "EASE", "B_SPLINE", "CARDINAL", "HSV", "HSL", "ALPHA"]


def build(variant):
    mat, nodes, links, color_in = emission_material("color_ramp")
    node = nodes.new("ShaderNodeValToRGB")
    ramp = node.color_ramp
    ramp.elements[0].position = 0.1
    ramp.elements[0].color = (0.05, 0.1, 0.6, 1.0)
    ramp.elements.new(0.45).color = (1.0, 0.4, 0.05, 0.3)
    ramp.elements.new(0.7).color = (0.2, 0.9, 0.3, 0.8)
    ramp.elements[-1].position = 0.92
    ramp.elements[-1].color = (0.95, 0.95, 0.9, 1.0)
    if variant in ("HSV", "HSL"):
        ramp.color_mode = variant
        ramp.hue_interpolation = "FAR"
    elif variant != "ALPHA":
        ramp.interpolation = variant
    links.new(x_factor(nodes, links), node.inputs["Fac"])
    if variant == "ALPHA":
        links.new(node.outputs["Alpha"], color_in)
    else:
        links.new(node.outputs["Color"], color_in)
    return mat
