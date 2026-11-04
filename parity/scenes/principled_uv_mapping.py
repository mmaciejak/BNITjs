"""UV → Mapping → Principled BSDF Base Color: the Phase 2 "done" material (SPEC §9).

Blender cannot render the base color unlit, so the plane is lit by a uniform white world of
strength 1 with specular off (Specular IOR Level 0): a Lambert surface then returns exactly its
albedo, with no noise under cosine-weighted sampling. The browser renders the base color unlit.
"""

import bpy
from _common import new_material


def build():
    mat = new_material("principled_uv_mapping")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 1.0
    links.new(bsdf.outputs["BSDF"], nodes["Material Output"].inputs["Surface"])
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Location"].default_value = (0.1, -0.2, 0.0)
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, 0.4)
    mapping.inputs["Scale"].default_value = (0.8, 0.9, 1.0)
    links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], bsdf.inputs["Base Color"])
    return mat


def setup(plane):
    world = bpy.data.worlds.new("White")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = 1.0
    bpy.context.scene.world = world
