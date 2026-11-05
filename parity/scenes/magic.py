"""Magic Texture at several turbulence depths and distortions.

Object coordinates on the enlarged, offset plane, so values are negative too (Blender wraps them
with a modulo).
"""

from _common import by_id, emission_material, enlarge_and_offset

# variant: (depth, distortion, output)
SPECS = {
    "DEPTH0": (0, 1.0, "Color"),
    "DEPTH1": (1, 1.0, "Color"),
    "DEPTH2": (2, 1.0, "Color"),
    "DEPTH5": (5, 1.3, "Color"),
    "DEPTH10": (10, 0.8, "Color"),
    "NO_DISTORTION": (3, 0.0, "Color"),
    "FAC": (4, 1.6, "Fac"),
}
VARIANTS = list(SPECS)


def setup(plane, variant):
    enlarge_and_offset(plane)


def build(variant):
    depth, distortion, output = SPECS[variant]
    mat, nodes, links, color_in = emission_material("magic")
    coord = nodes.new("ShaderNodeTexCoord")
    node = nodes.new("ShaderNodeTexMagic")
    node.turbulence_depth = depth
    inputs = by_id(node.inputs)
    inputs["Scale"].default_value = 1.2
    inputs["Distortion"].default_value = distortion
    links.new(coord.outputs["Object"], inputs["Vector"])
    links.new(by_id(node.outputs)[output], color_in)
    return mat
