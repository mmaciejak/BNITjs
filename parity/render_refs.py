"""Render Blender reference images and export the matching glTF for every parity scene.

    blender -b --factory-startup --python parity/render_refs.py [-- scene_name ...]

For each parity/scenes/<name>.py (files starting with "_" are helpers), which defines build() ->
material, and optionally setup(plane) to change the plane mesh or object and
CAMERA = "PERSP" for a perspective camera (default orthographic). A module with
VARIANTS = [...] defines build(variant) (and setup(plane, variant)) and yields one scene per variant, named
<module>_<variant lowercased> (e.g. math_add):

- parity/references/<name>.png: Cycles render, 512×512, 16-bit, Standard view transform, box pixel
  filter of width 1 (each pixel is the average over its area), 64 samples, no dither.
- parity/compare/out/<name>/scene.gltf: the same plane, material and camera, exported with the
  add-on, for the browser side (parity/compare/run.mjs).

Every scene is a 2×2 plane on the XY plane, seen from +Z by an orthographic camera that frames it
exactly, so UV (0, 0) is at the bottom left of the image.
"""

import importlib.util
import json
import math
import os
import sys

import bpy

PARITY = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(PARITY)
sys.path.insert(0, REPO)
sys.path.insert(0, os.path.join(REPO, "exporter", "tests"))
sys.path.insert(0, os.path.join(PARITY, "scenes"))

from test_gltf_export import disable_addon, enable_addon  # noqa: E402

RESOLUTION = 512
SAMPLES = 64
SCENES_DIR = os.path.join(PARITY, "scenes")
REFS_DIR = os.path.join(PARITY, "references")
OUT_DIR = os.path.join(PARITY, "compare", "out")


def load_scene_module(name):
    spec = importlib.util.spec_from_file_location(f"parity_scene_{name}", os.path.join(SCENES_DIR, f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def setup_render(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.cycles.seed = 0
    scene.cycles.pixel_filter_type = "BOX"
    scene.cycles.filter_width = 1.0
    scene.render.resolution_x = RESOLUTION
    scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.dither_intensity = 0.0
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"
    image = scene.render.image_settings
    image.file_format = "PNG"
    image.color_mode = "RGB"
    image.color_depth = "16"
    image.compression = 15


def build_scene(material, setup=None, camera_type="ORTHO"):
    scene = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0.0, 0.0, 0.0))
    plane = bpy.context.active_object
    plane.name = "Plane"
    plane.data.materials.append(material)
    if setup is not None:
        setup(plane)

    cam_data = bpy.data.cameras.new("Camera")
    if camera_type == "PERSP":
        # Field of view that frames the 2×2 plane exactly from a distance of 2.
        cam_data.type = "PERSP"
        cam_data.sensor_fit = "HORIZONTAL"
        cam_data.angle = 2.0 * math.atan(0.5)
    else:
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = 2.0
    cam_data.clip_start = 0.1
    cam_data.clip_end = 10.0
    camera = bpy.data.objects.new("Camera", cam_data)
    camera.location = (0.0, 0.0, 2.0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    setup_render(scene)


def scene_jobs(argv):
    """(scene name, module, variant) for every scene; a module with VARIANTS gives one scene each.

    Modules with BLENDER_MAX = (major, minor) (nodes removed in later versions) are skipped on
    newer Blender. --version-limited renders only those modules (check.sh runs it with 4.2).
    """
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    version_limited = "--version-limited" in args
    wanted = [a for a in args if not a.startswith("--")]
    jobs = []
    for module_name in sorted(f[:-3] for f in os.listdir(SCENES_DIR) if f.endswith(".py") and not f.startswith("_")):
        if wanted and not any(w == module_name or w.startswith(module_name + "_") for w in wanted):
            continue
        module = load_scene_module(module_name)
        limit = getattr(module, "BLENDER_MAX", None)
        if limit is not None and bpy.app.version[:2] > tuple(limit):
            continue
        if version_limited and limit is None:
            continue
        variants = getattr(module, "VARIANTS", None)
        if variants is None:
            jobs.append((module_name, module, None))
            continue
        for variant in variants:
            name = f"{module_name}_{str(variant).lower()}"
            if not wanted or module_name in wanted or name in wanted:
                jobs.append((name, module, variant))
    return jobs


def main():
    os.makedirs(REFS_DIR, exist_ok=True)
    for name, module, variant in scene_jobs(sys.argv):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        enable_addon()
        material = module.build() if variant is None else module.build(variant)
        material.name = name
        setup = getattr(module, "setup", None)
        if setup is not None and variant is not None:
            setup = (lambda s, v: lambda plane: s(plane, v))(setup, variant)
        build_scene(material, setup, getattr(module, "CAMERA", "ORTHO"))

        scene = bpy.context.scene
        scene.render.filepath = os.path.join(REFS_DIR, f"{name}.png")
        bpy.ops.render.render(write_still=True)

        out = os.path.join(OUT_DIR, name)
        os.makedirs(out, exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(out, "scene.gltf"),
            export_format="GLTF_SEPARATE",
            export_cameras=True,
        )
        with open(os.path.join(out, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({"blender": bpy.app.version_string, "resolution": RESOLUTION, "samples": SAMPLES}, f)
        disable_addon()
        print(f"parity: rendered {name}")


main()
