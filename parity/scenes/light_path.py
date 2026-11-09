"""Light Path through the orthographic camera. Every shaded point is hit by a camera ray.

CAMERA_RAY: Is Camera Ray (1). OTHERS: the sum of every other ray type and depth (0), plus 0.25 so
a wrong value shows either way. RAY_LENGTH: Ray Length × 0.5 − 0.8 (the camera is 2 away).
"""

from _common import emission_material

VARIANTS = ["CAMERA_RAY", "OTHERS", "RAY_LENGTH"]


def build(variant):
    mat, nodes, links, color_in = emission_material("light_path")
    node = nodes.new("ShaderNodeLightPath")
    if variant == "CAMERA_RAY":
        links.new(node.outputs["Is Camera Ray"], color_in)
        return mat
    if variant == "RAY_LENGTH":
        show = nodes.new("ShaderNodeMath")
        show.operation = "MULTIPLY_ADD"
        show.inputs[1].default_value = 0.5
        show.inputs[2].default_value = -0.8
        links.new(node.outputs["Ray Length"], show.inputs[0])
        links.new(show.outputs[0], color_in)
        return mat
    total = None
    for output in node.outputs:
        if output.name in ("Is Camera Ray", "Ray Length") or not output.enabled:
            continue
        add = nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        if total is None:
            add.inputs[0].default_value = 0.25
        else:
            links.new(total, add.inputs[0])
        links.new(output, add.inputs[1])
        total = add.outputs[0]
    links.new(total, color_in)
    return mat
