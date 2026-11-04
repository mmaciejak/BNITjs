"""Diffuse BSDF (roughness 0) with a UV color, under a uniform white world: Lambert returns its
albedo exactly, so the reference is the color the browser renders unlit (see principled_uv_mapping)."""

from _common import new_material
from principled_uv_mapping import setup  # noqa: F401  (white world)


def build():
    mat = new_material("diffuse")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.new("ShaderNodeBsdfDiffuse")
    bsdf.inputs["Roughness"].default_value = 0.0
    links.new(bsdf.outputs["BSDF"], nodes["Material Output"].inputs["Surface"])
    coord = nodes.new("ShaderNodeTexCoord")
    links.new(coord.outputs["UV"], bsdf.inputs["Color"])
    return mat
