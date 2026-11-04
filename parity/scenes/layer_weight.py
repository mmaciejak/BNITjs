"""Layer Weight Fresnel and Facing (Blend 0.3, 0.5, 0.8) with a tilted normal, perspective camera."""

from _common import emission_material, tilted_normal

CAMERA = "PERSP"
VARIANTS = ["FRESNEL_03", "FRESNEL_08", "FACING_03", "FACING_05", "FACING_08", "FACING_UNLINKED"]


def build(variant):
    mat, nodes, links, color_in = emission_material("layer_weight")
    node = nodes.new("ShaderNodeLayerWeight")
    node.inputs["Blend"].default_value = {"03": 0.3, "05": 0.5, "08": 0.8}.get(variant[-2:], 0.3)
    if variant != "FACING_UNLINKED":
        links.new(tilted_normal(nodes, links), node.inputs["Normal"])
    out = "Fresnel" if variant.startswith("FRESNEL") else "Facing"
    links.new(node.outputs[out], color_in)
    return mat
