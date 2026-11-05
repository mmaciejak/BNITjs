"""World shaders: the Background seen directly by a perspective camera looking just above the
horizon (the plane is below the view).

CONSTANT: a plain color. DIRECTION: Generated (the view direction) × 0.5 + 0.5. NORMAL: the
Normal output (−direction) × 0.5 + 0.5. NOISE: Noise Texture with its Vector unlinked.
ENV_EQUIRECT / ENV_MIRROR: Environment Texture of a smooth 64×32 image, both projections.
"""

import math

import bpy
from _common import emission_material

CAMERA = "PERSP"
CAMERA_ROTATION = (1.75, 0.0, 0.6)
VARIANTS = ["CONSTANT", "DIRECTION", "NORMAL", "NOISE", "ENV_EQUIRECT", "ENV_MIRROR"]


def build(variant):
    mat, nodes, links, color_in = emission_material("world_plane")
    color_in.default_value = (0.0, 0.0, 0.0, 1.0)
    return mat


def env_image():
    """A smooth 64×32 image (no hard edges, so Linear interpolation is all that differs)."""
    w, h = 64, 32
    image = bpy.data.images.new("Env", w, h)
    pixels = []
    for y in range(h):
        for x in range(w):
            u, v = x / w, y / h
            pixels += [0.5 + 0.45 * math.sin(2 * math.pi * u), v, 0.5 + 0.4 * math.cos(6 * math.pi * u + 3 * v), 1.0]
    image.pixels = pixels
    image.pack()
    return image


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
    elif variant.startswith("ENV_"):
        env = nodes.new("ShaderNodeTexEnvironment")
        env.image = env_image()
        env.projection = "MIRROR_BALL" if variant == "ENV_MIRROR" else "EQUIRECTANGULAR"
        links.new(env.outputs["Color"], bg.inputs["Color"])
    else:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.0
        links.new(noise.outputs["Color"], bg.inputs["Color"])
    return world
