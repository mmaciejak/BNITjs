"""Brick Texture: sharp mortar, squash, offset and bias.

Object coordinates on the enlarged, offset plane (negative rows and columns too), Scale 1. The
mortar is wide and smooth (size 0.06, smooth 0.7) so its profile spans several pixels; SHARP has
hard mortar edges.
"""

from _common import by_id, emission_material, enlarge_and_offset

# variant: ({property: value}, {input: value}, output)
SPECS = {
    "DEFAULT": ({}, {}, "Color"),
    "SHARP": ({}, {"Mortar Smooth": 0.0, "Mortar Size": 0.04}, "Color"),
    "SQUASH": ({"squash": 0.6, "squash_frequency": 3, "offset": 0.3, "offset_frequency": 3}, {}, "Color"),
    "NO_OFFSET": ({"offset_frequency": 0}, {}, "Color"),
    "BIAS": ({}, {"Bias": 0.4, "Brick Width": 0.8, "Row Height": 0.3}, "Color"),
    "FAC": ({}, {"Mortar Smooth": 0.6, "Mortar Size": 0.08}, "Fac"),
}
VARIANTS = list(SPECS)


def setup(plane, variant):
    enlarge_and_offset(plane)


def build(variant):
    props, values, output = SPECS[variant]
    mat, nodes, links, color_in = emission_material("brick")
    coord = nodes.new("ShaderNodeTexCoord")
    node = nodes.new("ShaderNodeTexBrick")
    for name, value in props.items():
        setattr(node, name, value)
    inputs = by_id(node.inputs)
    inputs["Scale"].default_value = 1.0
    inputs["Mortar Size"].default_value = 0.06
    inputs["Mortar Smooth"].default_value = 0.7
    inputs["Color1"].default_value = (0.9, 0.4, 0.2, 1.0)
    inputs["Color2"].default_value = (0.3, 0.6, 0.8, 1.0)
    inputs["Mortar"].default_value = (0.05, 0.05, 0.1, 1.0)
    for name, value in values.items():
        inputs[name].default_value = value
    links.new(coord.outputs["Object"], inputs["Vector"])
    links.new(by_id(node.outputs)[output], color_in)
    return mat
