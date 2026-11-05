"""World shaders: the Background seen directly by a perspective camera looking just above the
horizon (the plane is below the view).

CONSTANT: a plain color. DIRECTION: Generated (the view direction) × 0.5 + 0.5. NORMAL: the
Normal output (−direction) × 0.5 + 0.5. NOISE: Noise Texture with its Vector unlinked.
ENV_EQUIRECT / ENV_MIRROR: Environment Texture of a smooth 64×32 image, both projections.
ENV_HDR: the same with a float image (values up to 3, Strength 0.3), exported as RGBE.
SKY_*: Sky Texture models (baked by the exporter), Strength 0.4 (0.04 for the physical models, which
are far brighter), 5.x types; see sky_legacy for 4.2.
"""

import math

import bpy
from _common import emission_material

CAMERA = "PERSP"
CAMERA_ROTATION = (1.75, 0.0, 0.6)
VARIANTS = [
    "CONSTANT",
    "DIRECTION",
    "NORMAL",
    "NOISE",
    "ENV_EQUIRECT",
    "ENV_MIRROR",
    "ENV_HDR",
    "SKY_MULTIPLE_SCATTERING",
    "SKY_SINGLE_SCATTERING",
    "SKY_PREETHAM",
    "SKY_HOSEK_WILKIE",
]


def build(variant):
    mat, nodes, links, color_in = emission_material("world_plane")
    color_in.default_value = (0.0, 0.0, 0.0, 1.0)
    return mat


def env_image(hdr=False):
    """A smooth 64×32 image (no hard edges, so Linear interpolation is all that differs). The HDR
    version is a float image with values up to 3."""
    w, h = 64, 32
    gain = 3.0 if hdr else 1.0
    image = bpy.data.images.new("Env", w, h, float_buffer=hdr)
    pixels = []
    for y in range(h):
        for x in range(w):
            u, v = x / w, y / h
            r, b = 0.5 + 0.45 * math.sin(2 * math.pi * u), 0.5 + 0.4 * math.cos(6 * math.pi * u + 3 * v)
            pixels += [gain * r, gain * v * v, gain * b, 1.0]
    image.pixels = pixels
    if not hdr:
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
    elif variant.startswith("SKY_"):
        sky = nodes.new("ShaderNodeTexSky")
        sky.sky_type = variant[4:]
        sky.sun_elevation = 0.3
        sky.sun_rotation = 2.5
        # The physical models are much brighter than Preetham / Hosek-Wilkie: keep them unclipped.
        physical = variant in ("SKY_MULTIPLE_SCATTERING", "SKY_SINGLE_SCATTERING", "SKY_NISHITA")
        bg.inputs["Strength"].default_value = 0.04 if physical else 0.4
        links.new(sky.outputs["Color"], bg.inputs["Color"])
    elif variant.startswith("ENV_"):
        env = nodes.new("ShaderNodeTexEnvironment")
        env.image = env_image(hdr=variant == "ENV_HDR")
        bg.inputs["Strength"].default_value = 0.3 if variant == "ENV_HDR" else 1.0
        env.projection = "MIRROR_BALL" if variant == "ENV_MIRROR" else "EQUIRECTANGULAR"
        links.new(env.outputs["Color"], bg.inputs["Color"])
    else:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.0
        links.new(noise.outputs["Color"], bg.inputs["Color"])
    return world
