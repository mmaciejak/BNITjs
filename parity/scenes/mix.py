"""Mix node: float, vector (uniform / non-uniform) and color with every blend mode.

A and B are two colorful gradients; the factor is Generated x in [-0.25, 1.25] (clamped by
default; the *_NOCLAMP variants turn Clamp Factor off, *_CLAMP turns Clamp Result on).
"""

from _common import by_id, emission_material, show_signed, two_colors, x_factor

BLENDS = [
    "MIX", "DARKEN", "MULTIPLY", "BURN", "LIGHTEN", "SCREEN", "DODGE", "ADD", "OVERLAY", "SOFT_LIGHT",
    "LINEAR_LIGHT", "DIFFERENCE", "EXCLUSION", "SUBTRACT", "DIVIDE", "HUE", "SATURATION", "COLOR", "VALUE",
]  # fmt: skip
VARIANTS = [
    "FLOAT", "FLOAT_NOCLAMP", "VECTOR", "VECTOR_NON_UNIFORM",
    *[f"COLOR_{b}" for b in BLENDS], "COLOR_ADD_CLAMP", "COLOR_MIX_NOCLAMP",
]  # fmt: skip


def build(variant):
    mat, nodes, links, color_in = emission_material("mix")
    a, b = two_colors(nodes, links)
    node = nodes.new("ShaderNodeMix")
    ins, outs = by_id(node.inputs), by_id(node.outputs)
    node.clamp_factor = not variant.endswith("_NOCLAMP")
    links.new(x_factor(nodes, links), ins["Factor_Float"])
    if variant.startswith("FLOAT"):
        node.data_type = "FLOAT"
        sep_a = nodes.new("ShaderNodeSeparateXYZ")
        sep_b = nodes.new("ShaderNodeSeparateXYZ")
        links.new(a, sep_a.inputs[0])
        links.new(b, sep_b.inputs[0])
        links.new(sep_a.outputs["X"], ins["A_Float"])
        links.new(sep_b.outputs["Y"], ins["B_Float"])
        show_signed(nodes, links, outs["Result_Float"], color_in)
        return mat
    if variant.startswith("VECTOR"):
        node.data_type = "VECTOR"
        links.new(a, ins["A_Vector"])
        links.new(b, ins["B_Vector"])
        if variant == "VECTOR_NON_UNIFORM":
            node.factor_mode = "NON_UNIFORM"
            ins["Factor_Vector"].default_value = (0.2, 0.7, 1.3)
        links.new(outs["Result_Vector"], color_in)
        return mat
    node.data_type = "RGBA"
    node.blend_type = variant.replace("COLOR_", "").replace("_CLAMP", "").replace("_NOCLAMP", "")
    node.clamp_result = variant.endswith("_CLAMP") and not variant.endswith("_NOCLAMP")
    links.new(a, ins["A_Color"])
    links.new(b, ins["B_Color"])
    links.new(outs["Result_Color"], color_in)
    return mat
