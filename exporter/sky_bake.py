"""Bake a Sky Texture node to an equirectangular float image with Cycles.

Blender's sky models (Preetham, Hosek-Wilkie, Nishita, single/multiple scattering) are computed in
C++ and are not reachable from Python, so the exporter renders the sky instead: a temporary scene
whose World is only the Sky Texture, seen by an equirectangular panoramic camera. A camera rotation
of (90°, 0, 270°) makes the render line up exactly with Environment Texture's equirectangular
mapping (measured on Blender 4.2 and 5.2), so the runtime samples the result like an Environment
Texture. The sun disc, a fraction of a degree wide, is blurred over a pixel or two.
"""

import math
import os
import tempfile

import bpy

WIDTH, HEIGHT = 1024, 512
SAMPLES = 16


def _new_world(props):
    world = bpy.data.worlds.new("bsw_sky_bake")
    if bpy.app.version < (5, 0, 0):
        world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    sky = nodes.new("ShaderNodeTexSky")
    for name, value in props.items():
        if name in ("textureMapping", "colorMapping") or not hasattr(sky, name):
            continue
        try:
            setattr(sky, name, value)
        except (AttributeError, TypeError, ValueError):
            pass
    links.new(sky.outputs["Color"], bg.inputs["Color"])
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    return world


def bake_sky(props):
    """Render a Sky Texture with the given node properties; returns a float bpy Image (the caller
    removes it)."""
    scene = bpy.data.scenes.new("bsw_sky_bake")
    world = _new_world(props)
    cam_data = bpy.data.cameras.new("bsw_sky_bake")
    cam_data.type = "PANO"
    if hasattr(cam_data, "panorama_type"):
        cam_data.panorama_type = "EQUIRECTANGULAR"
    else:  # Blender 4.2
        cam_data.cycles.panorama_type = "EQUIRECTANGULAR"
    camera = bpy.data.objects.new("bsw_sky_bake", cam_data)
    camera.rotation_euler = (math.radians(90.0), 0.0, math.radians(270.0))
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    scene.cycles.pixel_filter_type = "BOX"
    scene.cycles.filter_width = 1.0
    scene.render.resolution_x, scene.render.resolution_y = WIDTH, HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "sky.exr")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True, scene=scene.name)
            image = bpy.data.images.load(path, check_existing=False)
            image.pixels[0]  # read the file before the directory goes away
            image.pack()
            return image
    finally:
        bpy.data.objects.remove(camera)
        bpy.data.cameras.remove(cam_data)
        bpy.data.worlds.remove(world)
        bpy.data.scenes.remove(scene)
