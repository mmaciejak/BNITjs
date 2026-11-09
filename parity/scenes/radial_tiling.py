"""Radial Tiling (Blender 5.x) on Object coordinates (the plane spans −1…1).

Segment Coordinates are shown × 0.5 + 0.5. Variants cover each case of Blender's
calculate_out_variables: integer sides with roundness 0, in between and 1; fractional sides with
roundness 0 and in between (normalized or not); Segment ID; Segment Width and Rotation.
"""

from _common import by_id, emission_material

VARIANTS = [
    "SHARP",
    "ROUNDED",
    "ROUNDED_NORMALIZE",
    "CIRCLE",
    "FRACTIONAL_SHARP",
    "FRACTIONAL_ROUNDED",
    "FRACTIONAL_ROUNDED_NORMALIZE",
    "TWO_SIDES",
    "SEGMENT_ID",
    "WIDTH_ROTATION",
]

SETTINGS = {
    # variant: (sides, roundness, normalize)
    "SHARP": (5.0, 0.0, False),
    "ROUNDED": (6.0, 0.4, False),
    "ROUNDED_NORMALIZE": (5.0, 0.4, True),
    "CIRCLE": (6.0, 1.0, True),
    "FRACTIONAL_SHARP": (4.5, 0.0, True),
    "FRACTIONAL_ROUNDED": (3.3, 0.6, False),
    "FRACTIONAL_ROUNDED_NORMALIZE": (4.5, 0.3, True),
    "TWO_SIDES": (2.0, 0.0, True),
    "SEGMENT_ID": (7.0, 0.0, False),
    "WIDTH_ROTATION": (4.6, 0.35, False),
}


def build(variant):
    mat, nodes, links, color_in = emission_material("radial_tiling")
    coord = nodes.new("ShaderNodeTexCoord")
    node = nodes.new("ShaderNodeRadialTiling")
    sides, roundness, normalize = SETTINGS[variant]
    inputs = by_id(node.inputs)
    inputs["Sides"].default_value = sides
    inputs["Roundness"].default_value = roundness
    node.normalize = normalize
    links.new(coord.outputs["Object"], inputs["Vector"])
    outputs = by_id(node.outputs)
    if variant == "SEGMENT_ID":
        scale = nodes.new("ShaderNodeMath")
        scale.operation = "DIVIDE"
        scale.inputs[1].default_value = sides
        links.new(outputs["Segment ID"], scale.inputs[0])
        links.new(scale.outputs[0], color_in)
        return mat
    if variant == "WIDTH_ROTATION":
        combine = nodes.new("ShaderNodeCombineXYZ")
        rotation = nodes.new("ShaderNodeMath")
        rotation.operation = "DIVIDE"
        rotation.inputs[1].default_value = 6.2831853
        links.new(outputs["Segment Width"], combine.inputs["X"])
        links.new(outputs["Segment Rotation"], rotation.inputs[0])
        links.new(rotation.outputs[0], combine.inputs["Y"])
        links.new(combine.outputs[0], color_in)
        return mat
    show = nodes.new("ShaderNodeMapping")
    show.inputs["Scale"].default_value = (0.5, 0.5, 0.5)
    show.inputs["Location"].default_value = (0.5, 0.5, 0.5)
    links.new(outputs["Segment Coordinates"], show.inputs["Vector"])
    links.new(show.outputs["Vector"], color_in)
    return mat
