"""Checker Texture: unlinked Vector (Generated), and Object coordinates at scale 2.5."""

from _common import emission_material

VARIANTS = ["DEFAULT", "OBJECT"]


def build(variant):
    mat, nodes, links, color_in = emission_material("checker")
    node = nodes.new("ShaderNodeTexChecker")
    node.inputs["Color1"].default_value = (0.9, 0.5, 0.1, 1.0)
    node.inputs["Color2"].default_value = (0.1, 0.2, 0.7, 1.0)
    if variant == "OBJECT":
        coord = nodes.new("ShaderNodeTexCoord")
        links.new(coord.outputs["Object"], node.inputs["Vector"])
        node.inputs["Scale"].default_value = 2.5
    links.new(node.outputs["Color"], color_in)
    return mat
