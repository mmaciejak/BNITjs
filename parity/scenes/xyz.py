"""Generated → Separate XYZ → Combine XYZ with the components swapped (Y, Z, X) → Emission."""

from _common import emission_material


def build():
    mat, nodes, links, color_in = emission_material("xyz")
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    comb = nodes.new("ShaderNodeCombineXYZ")
    links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    links.new(sep.outputs["Y"], comb.inputs["X"])
    links.new(sep.outputs["Z"], comb.inputs["Y"])
    links.new(sep.outputs["X"], comb.inputs["Z"])
    links.new(comb.outputs["Vector"], color_in)
    return mat
