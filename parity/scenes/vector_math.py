"""Vector Math, one scene per operation (operations added after 4.2 are skipped there).

A = Generated mapped to [-2, 2] on x and y (z = 0); B = Generated rotated, scaled and offset;
C = (0.5, 0.25, -0.75); Scale = 1.7 (0.7 for Refract). Vector results are shown as
v × 0.25 + 0.5, value results as (v, v, v) × 0.25 + 0.5.
"""

from _common import emission_material, show_signed

VARIANTS = [
    "ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "MULTIPLY_ADD", "CROSS_PRODUCT", "PROJECT", "REFLECT",
    "REFRACT", "FACEFORWARD", "DOT_PRODUCT", "DISTANCE", "LENGTH", "SCALE", "NORMALIZE", "ABSOLUTE",
    "POWER", "SIGN", "MINIMUM", "MAXIMUM", "ROUND", "FLOOR", "CEIL", "FRACTION", "MODULO", "WRAP",
    "SNAP", "SINE", "COSINE", "TANGENT",
]  # fmt: skip
VALUE_OPS = {"DOT_PRODUCT", "DISTANCE", "LENGTH"}


def build(variant):
    mat, nodes, links, color_in = emission_material("vector_math")
    coord = nodes.new("ShaderNodeTexCoord")
    a = nodes.new("ShaderNodeMapping")
    a.inputs["Scale"].default_value = (4.0, 4.0, 0.0)
    a.inputs["Location"].default_value = (-2.0, -2.0, 0.0)
    b = nodes.new("ShaderNodeMapping")
    b.inputs["Rotation"].default_value = (0.0, 0.0, 1.2)
    b.inputs["Scale"].default_value = (3.0, 2.0, 1.0)
    b.inputs["Location"].default_value = (-1.0, -0.6, 0.3)
    links.new(coord.outputs["Generated"], a.inputs["Vector"])
    links.new(coord.outputs["Generated"], b.inputs["Vector"])

    node = nodes.new("ShaderNodeVectorMath")
    ops = [i.identifier for i in node.bl_rna.properties["operation"].enum_items]
    node.operation = variant if variant in ops else "ADD"
    links.new(a.outputs["Vector"], node.inputs[0])
    links.new(b.outputs["Vector"], node.inputs[1])
    node.inputs[2].default_value = (0.5, 0.25, -0.75)
    # Found by identifier: the socket's name changes with the operation (e.g. "IOR" for Refract).
    scale = next(s for s in node.inputs if s.identifier == "Scale")
    scale.default_value = 0.7 if variant == "REFRACT" else 1.7

    if variant in VALUE_OPS:
        show_signed(nodes, links, node.outputs["Value"], color_in)
    else:
        remap = nodes.new("ShaderNodeMapping")
        remap.inputs["Scale"].default_value = (0.25, 0.25, 0.25)
        remap.inputs["Location"].default_value = (0.5, 0.5, 0.5)
        links.new(node.outputs["Vector"], remap.inputs["Vector"])
        links.new(remap.outputs["Vector"], color_in)
    return mat
