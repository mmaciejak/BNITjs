"""Geometry outputs (and the Tangent node) on the smooth, bumpy surface of image_box, perspective camera.

Vectors are shown as v × 0.5 + 0.5; Position as p × 0.3 + 0.5. TANGENT_X / _Y / _Z are the
Tangent node's radial tangents.
"""

from _common import by_id, emission_material
from image_box import setup  # noqa: F401  (the bumpy heightfield)

CAMERA = "PERSP"
OUTPUTS = {
    "POSITION": "Position", "NORMAL": "Normal", "TANGENT": "Tangent", "TRUE_NORMAL": "True Normal",
    "INCOMING": "Incoming", "BACKFACING": "Backfacing",
}  # fmt: skip
VARIANTS = [*OUTPUTS, "TANGENT_X", "TANGENT_Y", "TANGENT_Z"]


def build(variant):
    mat, nodes, links, color_in = emission_material("geometry")
    if variant.startswith("TANGENT_"):
        node = nodes.new("ShaderNodeTangent")
        node.direction_type = "RADIAL"
        node.axis = variant[-1]
        out = node.outputs["Tangent"]
    else:
        node = nodes.new("ShaderNodeNewGeometry")
        out = by_id(node.outputs)[OUTPUTS[variant]]
    remap = nodes.new("ShaderNodeVectorMath")
    remap.operation = "MULTIPLY_ADD"
    gain = 0.3 if variant == "POSITION" else 0.5
    remap.inputs[1].default_value = (gain, gain, gain)
    remap.inputs[2].default_value = (0.5, 0.5, 0.5)
    links.new(out, remap.inputs[0])
    links.new(remap.outputs[0], color_in)
    return mat
