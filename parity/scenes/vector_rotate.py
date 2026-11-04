"""Vector Rotate: every rotation type, normal and inverted, around center (0.1, -0.2, 0.3).

Input: Generated mapped to [-2, 2] on x and y; result shown as v × 0.25 + 0.5.
"""

from _common import emission_material

TYPES = ["AXIS_ANGLE", "X_AXIS", "Y_AXIS", "Z_AXIS", "EULER_XYZ"]
VARIANTS = TYPES + [t + "_INVERT" for t in TYPES]


def build(variant):
    mat, nodes, links, color_in = emission_material("vector_rotate")
    coord = nodes.new("ShaderNodeTexCoord")
    scale = nodes.new("ShaderNodeMapping")
    scale.inputs["Scale"].default_value = (4.0, 4.0, 1.0)
    scale.inputs["Location"].default_value = (-2.0, -2.0, 0.0)
    links.new(coord.outputs["Generated"], scale.inputs["Vector"])
    node = nodes.new("ShaderNodeVectorRotate")
    node.rotation_type = variant.replace("_INVERT", "")
    node.invert = variant.endswith("_INVERT")
    ins = {s.identifier: s for s in node.inputs}  # by identifier: see map_range.py
    ins["Center"].default_value = (0.1, -0.2, 0.3)
    ins["Axis"].default_value = (0.3, -0.5, 0.8)
    ins["Angle"].default_value = 0.9
    ins["Rotation"].default_value = (0.4, -0.7, 1.1)
    links.new(scale.outputs["Vector"], ins["Vector"])
    remap = nodes.new("ShaderNodeMapping")
    remap.inputs["Scale"].default_value = (0.25, 0.25, 0.25)
    remap.inputs["Location"].default_value = (0.5, 0.5, 0.5)
    links.new(node.outputs["Vector"], remap.inputs["Vector"])
    links.new(remap.outputs["Vector"], color_in)
    return mat
