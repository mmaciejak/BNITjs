"""Live parameters at their defaults render exactly like constants.

Color "$Tint" × Value "$Gain" + a "$Mix" group's unlinked inputs (Factor, Other) → Emission.
"""

import bpy
from _common import emission_material


def build():
    group = bpy.data.node_groups.new("MixGroup", "ShaderNodeTree")
    group.interface.new_socket("Factor", in_out="INPUT", socket_type="NodeSocketFloat")
    group.interface.new_socket("Base", in_out="INPUT", socket_type="NodeSocketColor")
    group.interface.new_socket("Other", in_out="INPUT", socket_type="NodeSocketColor")
    group.interface.new_socket("Color", in_out="OUTPUT", socket_type="NodeSocketColor")
    gi, go = group.nodes.new("NodeGroupInput"), group.nodes.new("NodeGroupOutput")
    mix = group.nodes.new("ShaderNodeMixRGB")
    group.links.new(gi.outputs["Factor"], mix.inputs["Fac"])
    group.links.new(gi.outputs["Base"], mix.inputs["Color1"])
    group.links.new(gi.outputs["Other"], mix.inputs["Color2"])
    group.links.new(mix.outputs["Color"], go.inputs["Color"])

    mat, nodes, links, color_in = emission_material("params")
    tint = nodes.new("ShaderNodeRGB")
    tint.label = "$Tint"
    tint.outputs[0].default_value = (0.2, 0.6, 0.9, 1.0)
    gain = nodes.new("ShaderNodeValue")
    gain.label = "$Gain"
    gain.outputs[0].default_value = 0.8
    scaled = nodes.new("ShaderNodeVectorMath")
    scaled.operation = "SCALE"
    links.new(tint.outputs[0], scaled.inputs[0])
    links.new(gain.outputs[0], next(s for s in scaled.inputs if s.identifier == "Scale"))
    node = nodes.new("ShaderNodeGroup")
    node.node_tree = group
    node.label = "$Mix"
    node.inputs["Factor"].default_value = 0.35
    node.inputs["Other"].default_value = (0.9, 0.2, 0.1, 1.0)
    links.new(scaled.outputs["Vector"], node.inputs["Base"])
    links.new(node.outputs["Color"], color_in)
    return mat
