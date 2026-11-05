"""Build the product-materials example and export it with the add-on.

    blender -b --factory-startup --python examples/materials/make_asset.py

Writes examples/materials/materials.glb: a row of spheres with Principled BSDF materials that use
the physical extras (coat, transmission, sheen, thin film, anisotropy, specular level and tint),
and a Sky Texture World (baked by the exporter).
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, REPO)
sys.path.insert(0, os.path.join(REPO, "exporter", "tests"))
from test_gltf_export import enable_addon  # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)
enable_addon()

# name: {input: value}
MATERIALS = {
    "Car Paint": {
        "Base Color": (0.5, 0.02, 0.03, 1),
        "Metallic": 0.6,
        "Roughness": 0.35,
        "Coat Weight": 1.0,
        "Coat Roughness": 0.03,
    },
    "Glass": {"Base Color": (0.9, 1.0, 0.95, 1), "Roughness": 0.0, "Transmission Weight": 1.0, "IOR": 1.45},
    "Fabric": {
        "Base Color": (0.08, 0.12, 0.35, 1),
        "Roughness": 0.9,
        "Sheen Weight": 1.0,
        "Sheen Tint": (0.8, 0.85, 1.0, 1),
        "Sheen Roughness": 0.4,
    },
    "Soap Film": {
        "Base Color": (0.05, 0.05, 0.05, 1),
        "Roughness": 0.05,
        "Thin Film Thickness": 450.0,
        "Thin Film IOR": 1.33,
    },
    "Brushed Metal": {
        "Base Color": (0.8, 0.8, 0.82, 1),
        "Metallic": 1.0,
        "Roughness": 0.35,
        "Anisotropic": 0.8,
        "Anisotropic Rotation": 0.25,
    },
    "Plastic": {
        "Base Color": (0.9, 0.55, 0.1, 1),
        "Roughness": 0.2,
        "Specular IOR Level": 0.8,
        "Specular Tint": (1.0, 0.85, 0.7, 1),
    },
}

for index, (name, values) in enumerate(MATERIALS.items()):
    mat = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    for socket, value in values.items():
        bsdf.inputs[socket].default_value = value
    x = (index - (len(MATERIALS) - 1) / 2) * 1.25
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.5, location=(x, 0, 0))
    sphere = bpy.context.active_object
    sphere.name = name
    bpy.ops.object.shade_smooth()
    sphere.data.materials.append(mat)

world = bpy.data.worlds.new("Sky")
if bpy.app.version < (5, 0, 0):
    world.use_nodes = True
nodes, links = world.node_tree.nodes, world.node_tree.links
nodes.clear()
sky = nodes.new("ShaderNodeTexSky")
sky.sun_elevation = 0.35
background = nodes.new("ShaderNodeBackground")
background.inputs["Strength"].default_value = 0.012 if bpy.app.version >= (5, 0, 0) else 0.05
output = nodes.new("ShaderNodeOutputWorld")
links.new(sky.outputs["Color"], background.inputs["Color"])
links.new(background.outputs["Background"], output.inputs["Surface"])
bpy.context.scene.world = world

bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, "materials.glb"), export_format="GLB", export_tangents=True)
print("wrote", os.path.join(HERE, "materials.glb"))
