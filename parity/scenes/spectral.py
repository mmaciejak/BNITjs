"""Blackbody and Wavelength over their input ranges (and past both ends), along Generated x.

The Blackbody output reaches about 6 (deep red below 1000 K), so it is scaled by 0.15.
"""

from _common import by_id, emission_material

# variant: (node, input, lo, hi, display scale)
SPECS = {
    "BLACKBODY": ("ShaderNodeBlackbody", "Temperature", 300.0, 13000.0, 0.15),
    "BLACKBODY_LOW": ("ShaderNodeBlackbody", "Temperature", 750.0, 2500.0, 0.15),
    "WAVELENGTH": ("ShaderNodeWavelength", "Wavelength", 350.0, 800.0, 1.0),
}
VARIANTS = list(SPECS)


def build(variant):
    node_type, socket, lo, hi, gain = SPECS[variant]
    mat, nodes, links, color_in = emission_material("spectral")
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    value = nodes.new("ShaderNodeMath")
    value.operation = "MULTIPLY_ADD"
    value.inputs[1].default_value = hi - lo
    value.inputs[2].default_value = lo
    node = nodes.new(node_type)
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    by_id(scale.inputs)["Scale"].default_value = gain
    links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    links.new(sep.outputs["X"], value.inputs[0])
    links.new(value.outputs[0], by_id(node.inputs)[socket])
    links.new(node.outputs["Color"], scale.inputs[0])
    links.new(scale.outputs[0], color_in)
    return mat
