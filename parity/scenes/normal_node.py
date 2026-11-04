"""Normal node: Normal output, and Dot with the input unlinked and linked to a tilted normal."""

from _common import emission_material, tilted_normal

VARIANTS = ["NORMAL", "DOT_UNLINKED", "DOT_LINKED"]


def build(variant):
    mat, nodes, links, color_in = emission_material("normal_node")
    node = nodes.new("ShaderNodeNormal")
    node.outputs["Normal"].default_value = (0.3, 0.5, 0.81)
    if variant == "NORMAL":
        show = nodes.new("ShaderNodeMapping")
        show.inputs["Scale"].default_value = (0.5, 0.5, 0.5)
        show.inputs["Location"].default_value = (0.5, 0.5, 0.5)
        links.new(node.outputs["Normal"], show.inputs["Vector"])
        links.new(show.outputs["Vector"], color_in)
        return mat
    if variant == "DOT_LINKED":
        links.new(tilted_normal(nodes, links), node.inputs["Normal"])
    links.new(node.outputs["Dot"], color_in)
    return mat
