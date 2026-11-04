"""Math, one scene per operation (plus use_clamp).

a = x, b = y of Generated mapped to [-2, 2]; c = 0.5. The result is shown as
(r, r, r) × 0.25 + 0.5 so negative values stay visible.
"""

from _common import emission_material

OPERATIONS = [
    "ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "MULTIPLY_ADD", "POWER", "LOGARITHM", "SQRT",
    "INVERSE_SQRT", "ABSOLUTE", "EXPONENT", "MINIMUM", "MAXIMUM", "LESS_THAN", "GREATER_THAN",
    "SIGN", "COMPARE", "SMOOTH_MIN", "SMOOTH_MAX", "ROUND", "FLOOR", "CEIL", "TRUNC", "FRACT",
    "MODULO", "FLOORED_MODULO", "WRAP", "SNAP", "PINGPONG", "SINE", "COSINE", "TANGENT",
    "ARCSINE", "ARCCOSINE", "ARCTANGENT", "ARCTAN2", "SINH", "COSH", "TANH", "RADIANS", "DEGREES",
]  # fmt: skip
VARIANTS = [*OPERATIONS, "MULTIPLY_CLAMP"]


def signed_inputs(nodes, links, lo=-2.0, hi=2.0):
    """Separate XYZ of Generated remapped to [lo, hi]."""
    coord = nodes.new("ShaderNodeTexCoord")
    scale = nodes.new("ShaderNodeMapping")
    scale.inputs["Scale"].default_value = (hi - lo, hi - lo, 1.0)
    scale.inputs["Location"].default_value = (lo, lo, 0.0)
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Generated"], scale.inputs["Vector"])
    links.new(scale.outputs["Vector"], sep.inputs["Vector"])
    return sep


def show_signed(nodes, links, value_socket, color_in):
    """(v, v, v) × 0.25 + 0.5 into the emission color."""
    comb = nodes.new("ShaderNodeCombineXYZ")
    for axis in "XYZ":
        links.new(value_socket, comb.inputs[axis])
    remap = nodes.new("ShaderNodeMapping")
    remap.inputs["Scale"].default_value = (0.25, 0.25, 0.25)
    remap.inputs["Location"].default_value = (0.5, 0.5, 0.5)
    links.new(comb.outputs["Vector"], remap.inputs["Vector"])
    links.new(remap.outputs["Vector"], color_in)


def build(variant):
    mat, nodes, links, color_in = emission_material("math")
    sep = signed_inputs(nodes, links)
    node = nodes.new("ShaderNodeMath")
    node.operation = "MULTIPLY" if variant == "MULTIPLY_CLAMP" else variant
    node.use_clamp = variant == "MULTIPLY_CLAMP"
    links.new(sep.outputs["X"], node.inputs[0])
    links.new(sep.outputs["Y"], node.inputs[1])
    node.inputs[2].default_value = 0.5
    show_signed(nodes, links, node.outputs[0], color_in)
    return mat
