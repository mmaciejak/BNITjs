"""Mix Shader and Add Shader of Emission shaders (exact in the runtime): two gradients mixed by
Generated x, by a constant factor, nested, and added.
"""

from _common import emission_material, two_colors, x_factor

VARIANTS = ["MIX", "MIX_CONSTANT", "MIX_NESTED", "ADD"]


def emission(nodes, links, color_socket=None, color=None):
    node = nodes.new("ShaderNodeEmission")
    if color_socket is not None:
        links.new(color_socket, node.inputs["Color"])
    else:
        node.inputs["Color"].default_value = color
    return node.outputs["Emission"]


def build(variant):
    mat, nodes, links, _ = emission_material("shader_combine")
    out = nodes["Material Output"].inputs["Surface"]
    a, b = two_colors(nodes, links)
    shader_a = emission(nodes, links, a)
    shader_b = emission(nodes, links, b)
    if variant == "ADD":
        node = nodes.new("ShaderNodeAddShader")
        links.new(shader_a, node.inputs[0])
        links.new(shader_b, node.inputs[1])
        top = node.outputs[0]
    else:
        node = nodes.new("ShaderNodeMixShader")
        if variant == "MIX_CONSTANT":
            node.inputs["Fac"].default_value = 0.3
        else:
            links.new(x_factor(nodes, links, 0.0, 1.0), node.inputs["Fac"])
        links.new(shader_a, node.inputs[1])
        links.new(shader_b, node.inputs[2])
        top = node.outputs[0]
        if variant == "MIX_NESTED":
            outer = nodes.new("ShaderNodeMixShader")
            outer.inputs["Fac"].default_value = 0.4
            links.new(top, outer.inputs[1])
            links.new(emission(nodes, links, color=(0.9, 0.8, 0.1, 1.0)), outer.inputs[2])
            top = outer.outputs[0]
    links.new(top, out)
    return mat
