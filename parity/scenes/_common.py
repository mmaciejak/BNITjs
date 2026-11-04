"""Helpers for parity scenes. Each scene module defines build() -> material.

Parity compares the unlit pattern only (SPEC §6): the node under test feeds an Emission shader
with strength 1, which feeds the Material Output.
"""

import bpy


def emission_material(name):
    """Return (material, nodes, links, color_input): link the pattern into color_input."""
    mat = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
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
