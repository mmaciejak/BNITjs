"""World shaders: the Background seen directly by a perspective camera looking just above the
horizon (the plane is below the view).

CONSTANT: a plain color. DIRECTION: Generated (the view direction) × 0.5 + 0.5. NORMAL: the
Normal output (−direction) × 0.5 + 0.5. NOISE: Noise Texture with its Vector unlinked.
"""

import bpy
from _common import emission_material

CAMERA = "PERSP"
CAMERA_ROTATION = (1.75, 0.0, 0.6)
VARIANTS = ["CONSTANT", "DIRECTION", "NORMAL", "NOISE"]


def build(variant):
    mat, nodes, links, color_in = emission_material("world_plane")
    color_in.default_value = (0.0, 0.0, 0.0, 1.0)
    return mat


def build_world(variant):
    world = bpy.data.worlds.new("World")
    if bpy.app.version < (5, 0, 0):
        world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    if variant == "CONSTANT":
        bg.inputs["Color"].default_value = (0.2, 0.5, 0.8, 1.0)
        bg.inputs["Strength"].default_value = 0.9
    elif variant in ("DIRECTION", "NORMAL"):
        coord = nodes.new("ShaderNodeTexCoord")
        remap = nodes.new("ShaderNodeVectorMath")
        remap.operation = "MULTIPLY_ADD"
        remap.inputs[1].default_value = (0.5, 0.5, 0.5)
        remap.inputs[2].default_value = (0.5, 0.5, 0.5)
        links.new(coord.outputs["Generated" if variant == "DIRECTION" else "Normal"], remap.inputs[0])
        links.new(remap.outputs[0], bg.inputs["Color"])
    else:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.0
        links.new(noise.outputs["Color"], bg.inputs["Color"])
    return world
