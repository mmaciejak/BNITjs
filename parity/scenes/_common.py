"""Helpers for parity scenes. Each scene module defines build() -> material.

Parity compares the unlit pattern only (SPEC §6): the node under test feeds an Emission shader
with strength 1, which feeds the Material Output.
"""

import bpy


def new_material(name):
    """An empty node material with only a Material Output."""
    mat = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    mat.node_tree.nodes.clear()
    mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
    return mat


def emission_material(name):
    """Return (material, nodes, links, color_input): link the pattern into color_input."""
    mat = new_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    output = nodes["Material Output"]
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return mat, nodes, links, emission.inputs["Color"]


def texcoord_material(name, output):
    """Texture Coordinate.<output> → Emission color."""
    mat, nodes, links, color_in = emission_material(name)
    coord = nodes.new("ShaderNodeTexCoord")
    links.new(coord.outputs[output], color_in)
    return mat


def enlarge_and_offset(plane):
    """Scale the mesh ×2 and shift it, so Generated/Object differ from UV in the visible area."""
    mesh = plane.data
    for v in mesh.vertices:
        v.co.x = v.co.x * 2.0 + 0.5
        v.co.y = v.co.y * 2.0 - 0.25
    mesh.update()


def mapping_material(name, vector_type, location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)):
    """Generated coordinates → Mapping(<vector_type>) → Emission color."""
    mat, nodes, links, color_in = emission_material(name)
    coord = nodes.new("ShaderNodeTexCoord")
    node = nodes.new("ShaderNodeMapping")
    node.vector_type = vector_type
    if "Location" in node.inputs and node.inputs["Location"].enabled:
        node.inputs["Location"].default_value = location
    node.inputs["Rotation"].default_value = rotation
    node.inputs["Scale"].default_value = scale
    links.new(coord.outputs["Generated"], node.inputs["Vector"])
    links.new(node.outputs["Vector"], color_in)
    return mat


def signed_inputs(nodes, links, lo=-2.0, hi=2.0):
    """Separate XYZ of Generated remapped to [lo, hi]."""
    coord = nodes.new("ShaderNodeTexCoord")
    scale = nodes.new("ShaderNodeMapping")
    scale.inputs["Scale"].default_value = (hi - lo, hi - lo, 1.0)
    scale.inputs["Location"].default_value = (lo, lo, 0.0)
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Generated"], scale.inputs["Vector"])
    links.new(scale.outputs["Vector"], sep.inputs["Vector"])
    return sep


def show_signed(nodes, links, value_socket, color_in):
    """(v, v, v) × 0.25 + 0.5 into the emission color."""
    comb = nodes.new("ShaderNodeCombineXYZ")
    for axis in "XYZ":
        links.new(value_socket, comb.inputs[axis])
    remap = nodes.new("ShaderNodeMapping")
    remap.inputs["Scale"].default_value = (0.25, 0.25, 0.25)
    remap.inputs["Location"].default_value = (0.5, 0.5, 0.5)
    links.new(comb.outputs["Vector"], remap.inputs["Vector"])
    links.new(remap.outputs["Vector"], color_in)


def gradient_color(nodes, links):
    """Generated (x, y, 0.5) scaled to [0, 1.5], so values above 1 are covered."""
    coord = nodes.new("ShaderNodeTexCoord")
    scale = nodes.new("ShaderNodeMapping")
    scale.inputs["Scale"].default_value = (1.5, 1.5, 1.5)
    links.new(coord.outputs["Generated"], scale.inputs["Vector"])
    return scale.outputs["Vector"]
