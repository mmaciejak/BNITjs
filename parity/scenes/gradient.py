"""Gradient Texture: every type on Generated mapped to [-1, 1], plus the unlinked default."""

from _common import emission_material

TYPES = ["LINEAR", "QUADRATIC", "EASING", "DIAGONAL", "SPHERICAL", "QUADRATIC_SPHERE", "RADIAL"]
VARIANTS = [*TYPES, "DEFAULT"]


def build(variant):
    mat, nodes, links, color_in = emission_material("gradient")
    node = nodes.new("ShaderNodeTexGradient")
    if variant != "DEFAULT":
        node.gradient_type = variant
        coord = nodes.new("ShaderNodeTexCoord")
        m = nodes.new("ShaderNodeMapping")
        m.inputs["Scale"].default_value = (2.0, 2.0, 1.0)
        m.inputs["Location"].default_value = (-1.0, -1.0, -0.5)
        links.new(coord.outputs["Generated"], m.inputs["Vector"])
        links.new(m.outputs["Vector"], node.inputs["Vector"])
    links.new(node.outputs["Color"], color_in)
    return mat
