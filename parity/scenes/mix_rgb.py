"""Legacy Mix (MixRGB): every blend mode; factor Generated x in [-0.25, 1.25]; plus Clamp."""

from _common import emission_material, two_colors, x_factor

BLENDS = [
    "MIX", "DARKEN", "MULTIPLY", "BURN", "LIGHTEN", "SCREEN", "DODGE", "ADD", "OVERLAY", "SOFT_LIGHT",
    "LINEAR_LIGHT", "DIFFERENCE", "EXCLUSION", "SUBTRACT", "DIVIDE", "HUE", "SATURATION", "COLOR", "VALUE",
]  # fmt: skip
VARIANTS = [*BLENDS, "ADD_CLAMP"]


def build(variant):
    mat, nodes, links, color_in = emission_material("mix_rgb")
    a, b = two_colors(nodes, links)
    node = nodes.new("ShaderNodeMixRGB")
    node.blend_type = variant.replace("_CLAMP", "")
    node.use_clamp = variant.endswith("_CLAMP")
    links.new(x_factor(nodes, links), node.inputs["Fac"])
    links.new(a, node.inputs["Color1"])
    links.new(b, node.inputs["Color2"])
    links.new(node.outputs["Color"], color_in)
    return mat
