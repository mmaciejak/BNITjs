"""Legacy Combine RGB / Combine HSV (Blender 4.2 only) from Generated x, y and 0.8."""

from _common import emission_material

BLENDER_MAX = (4, 99)
VARIANTS = ["RGB", "HSV"]


def build(variant):
    mat, nodes, links, color_in = emission_material("combine_legacy")
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    node = nodes.new("ShaderNodeCombineRGB" if variant == "RGB" else "ShaderNodeCombineHSV")
    links.new(sep.outputs["X"], node.inputs[0])
    links.new(sep.outputs["Y"], node.inputs[1])
    node.inputs[2].default_value = 0.8
    links.new(node.outputs[0], color_in)
    return mat
