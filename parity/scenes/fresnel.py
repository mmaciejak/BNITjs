"""Fresnel (IOR 1.45 and 3.0) through a perspective camera, and with a tilted linked normal."""

from _common import emission_material, tilted_normal

CAMERA = "PERSP"
VARIANTS = ["IOR145", "IOR3", "LINKED_NORMAL"]


def build(variant):
    mat, nodes, links, color_in = emission_material("fresnel")
    node = nodes.new("ShaderNodeFresnel")
    node.inputs["IOR"].default_value = 3.0 if variant == "IOR3" else 1.45
    if variant == "LINKED_NORMAL":
        links.new(tilted_normal(nodes, links), node.inputs["Normal"])
    links.new(node.outputs["Fac"], color_in)
    return mat
