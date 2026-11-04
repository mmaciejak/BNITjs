"""Legacy Separate RGB / Separate HSV (Blender 4.2 only), recombined as (a, b, c) → Emission."""

from _common import emission_material, two_colors

BLENDER_MAX = (4, 99)
VARIANTS = ["RGB", "HSV"]


def build(variant):
    mat, nodes, links, color_in = emission_material("separate_legacy")
    a, _ = two_colors(nodes, links)
    node = nodes.new("ShaderNodeSeparateRGB" if variant == "RGB" else "ShaderNodeSeparateHSV")
    links.new(a, node.inputs[0])
    comb = nodes.new("ShaderNodeCombineXYZ")
    for i, dst in enumerate("XYZ"):
        links.new(node.outputs[i], comb.inputs[dst])
    links.new(comb.outputs["Vector"], color_in)
    return mat
