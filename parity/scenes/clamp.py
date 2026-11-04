"""Clamp (MINMAX and RANGE with min > max) of x ∈ [-2, 2] with min = -0.5, max = 1.2 (swapped for RANGE)."""

from _common import emission_material, show_signed, signed_inputs

VARIANTS = ["MINMAX", "RANGE"]


def build(variant):
    mat, nodes, links, color_in = emission_material("clamp")
    sep = signed_inputs(nodes, links)
    node = nodes.new("ShaderNodeClamp")
    node.clamp_type = variant
    links.new(sep.outputs["X"], node.inputs["Value"])
    node.inputs["Min"].default_value = 1.2 if variant == "RANGE" else -0.5
    node.inputs["Max"].default_value = -0.5 if variant == "RANGE" else 1.2
    show_signed(nodes, links, node.outputs["Result"], color_in)
    return mat
