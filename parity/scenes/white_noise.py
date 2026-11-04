"""White Noise Texture in 1D-4D, Color and Value outputs.

The hash depends on the exact float bits of its input, so the input is piecewise constant:
floor(Generated × (8, 8, 0)) − (3.5, 2.25, −1.75), 8×8 cells whose edges fall on pixel edges (512 / 8).
W = x + 8y of the same cells, minus 20.5. UNLINKED leaves Vector unlinked.
"""

from _common import by_id, emission_material

VARIANTS = ["1D", "2D", "3D", "4D", "VALUE", "UNLINKED"]


def build(variant):
    mat, nodes, links, color_in = emission_material("white_noise")
    coord = nodes.new("ShaderNodeTexCoord")
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = (8.0, 8.0, 0.0)
    cells = nodes.new("ShaderNodeVectorMath")
    cells.operation = "FLOOR"
    shift = nodes.new("ShaderNodeVectorMath")
    shift.operation = "SUBTRACT"
    shift.inputs[1].default_value = (3.5, 2.25, -1.75)
    links.new(coord.outputs["Generated"], scale.inputs[0])
    links.new(scale.outputs[0], cells.inputs[0])
    links.new(cells.outputs[0], shift.inputs[0])
    index = nodes.new("ShaderNodeVectorMath")
    index.operation = "DOT_PRODUCT"
    index.inputs[1].default_value = (1.0, 8.0, 0.0)
    links.new(cells.outputs[0], index.inputs[0])
    w = nodes.new("ShaderNodeMath")
    w.operation = "SUBTRACT"
    w.inputs[1].default_value = 20.5
    links.new(index.outputs["Value"], w.inputs[0])

    node = nodes.new("ShaderNodeTexWhiteNoise")
    node.noise_dimensions = variant if variant[0].isdigit() else "3D"
    inputs = by_id(node.inputs)
    if variant != "UNLINKED":
        links.new(shift.outputs[0], inputs["Vector"])
    links.new(w.outputs[0], inputs["W"])
    links.new(by_id(node.outputs)["Value" if variant == "VALUE" else "Color"], color_in)
    return mat
