"""Camera Data through a perspective camera: View Vector, View Z Depth, View Distance."""

from _common import emission_material

CAMERA = "PERSP"
VARIANTS = ["VIEW_VECTOR", "Z_DEPTH", "DISTANCE"]


def build(variant):
    mat, nodes, links, color_in = emission_material("camera_data")
    node = nodes.new("ShaderNodeCameraData")
    if variant == "VIEW_VECTOR":
        show = nodes.new("ShaderNodeMapping")
        show.inputs["Scale"].default_value = (0.5, 0.5, 0.5)
        show.inputs["Location"].default_value = (0.5, 0.5, 0.5)
        links.new(node.outputs["View Vector"], show.inputs["Vector"])
        links.new(show.outputs["Vector"], color_in)
        return mat
    out = "View Z Depth" if variant == "Z_DEPTH" else "View Distance"
    show = nodes.new("ShaderNodeMath")
    show.operation = "MULTIPLY_ADD"
    show.inputs[1].default_value = 2.0
    show.inputs[2].default_value = -3.8
    links.new(node.outputs[out], show.inputs[0])
    links.new(show.outputs[0], color_in)
    return mat
