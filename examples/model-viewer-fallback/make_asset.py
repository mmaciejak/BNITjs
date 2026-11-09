"""Build examples/model-viewer-fallback/painted.glb: one asset for model-viewer and three.js.

    blender -b --factory-startup --python examples/model-viewer-fallback/make_asset.py

A beveled box with worn paint stands on a checker floor. The paint is procedural (Noise, Voronoi
bump, a "$Paint" color and a "$Wear" amount) and is darkened by Ambient Occlusion, which the
runtime cannot evaluate live: the exporter bakes it. The export also bakes every material into the
standard glTF material ("Bake PBR Fallback"), so viewers without the BNITjs runtime, such as
model-viewer, show the baked look, and three.js with BNITjs shows it live.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, REPO)
sys.path.insert(0, os.path.join(REPO, "exporter", "tests"))

import bpy  # noqa: E402
from test_gltf_export import enable_addon  # noqa: E402

from exporter import settings  # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)
enable_addon()
settings.register()


def sock(sockets, identifier):
    return next(s for s in sockets if s.identifier == identifier)


def new_material(name):
    mat = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    return mat


def paint_material():
    mat = new_material("Worn Paint")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    coord = nodes.new("ShaderNodeTexCoord")

    noise = nodes.new("ShaderNodeTexNoise")
    sock(noise.inputs, "Scale").default_value = 6.0
    sock(noise.inputs, "Detail").default_value = 6.0
    links.new(coord.outputs["Object"], sock(noise.inputs, "Vector"))

    wear = nodes.new("ShaderNodeValue")
    wear.label = "$Wear"
    wear.outputs[0].default_value = 0.45
    ramp_in = nodes.new("ShaderNodeMath")
    ramp_in.operation = "ADD"
    links.new(sock(noise.outputs, "Fac"), ramp_in.inputs[0])
    links.new(wear.outputs[0], ramp_in.inputs[1])
    edge = nodes.new("ShaderNodeMath")
    edge.operation = "GREATER_THAN"
    edge.inputs[1].default_value = 1.0
    links.new(ramp_in.outputs[0], edge.inputs[0])

    paint = nodes.new("ShaderNodeRGB")
    paint.label = "$Paint"
    paint.outputs[0].default_value = (0.05, 0.25, 0.6, 1.0)
    metal = nodes.new("ShaderNodeRGB")
    metal.outputs[0].default_value = (0.55, 0.52, 0.5, 1.0)
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    links.new(edge.outputs[0], sock(mix.inputs, "Factor_Float"))
    links.new(paint.outputs[0], sock(mix.inputs, "A_Color"))
    links.new(metal.outputs[0], sock(mix.inputs, "B_Color"))

    ao = nodes.new("ShaderNodeAmbientOcclusion")
    sock(ao.inputs, "Distance").default_value = 0.6
    shade = nodes.new("ShaderNodeMix")
    shade.data_type = "RGBA"
    shade.blend_type = "MULTIPLY"
    sock(shade.inputs, "Factor_Float").default_value = 1.0
    links.new(sock(mix.outputs, "Result_Color"), sock(shade.inputs, "A_Color"))
    links.new(sock(ao.outputs, "Color"), sock(shade.inputs, "B_Color"))
    links.new(sock(shade.outputs, "Result_Color"), bsdf.inputs["Base Color"])

    links.new(edge.outputs[0], bsdf.inputs["Metallic"])
    rough = nodes.new("ShaderNodeMapRange")
    sock(rough.inputs, "To Min").default_value = 0.45
    sock(rough.inputs, "To Max").default_value = 0.2
    links.new(edge.outputs[0], sock(rough.inputs, "Value"))
    links.new(sock(rough.outputs, "Result"), bsdf.inputs["Roughness"])

    voronoi = nodes.new("ShaderNodeTexVoronoi")
    sock(voronoi.inputs, "Scale").default_value = 14.0
    links.new(coord.outputs["Object"], sock(voronoi.inputs, "Vector"))
    bump = nodes.new("ShaderNodeBump")
    sock(bump.inputs, "Strength").default_value = 0.25
    links.new(sock(voronoi.outputs, "Distance"), sock(bump.inputs, "Height"))
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def floor_material():
    mat = new_material("Floor")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    checker = nodes.new("ShaderNodeTexChecker")
    sock(checker.inputs, "Scale").default_value = 8.0
    sock(checker.inputs, "Color1").default_value = (0.8, 0.8, 0.78, 1.0)
    sock(checker.inputs, "Color2").default_value = (0.35, 0.35, 0.34, 1.0)
    links.new(sock(checker.outputs, "Color"), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    return mat


bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.5))
box = bpy.context.active_object
box.name = "Box"
bevel = box.modifiers.new("Bevel", "BEVEL")
bevel.width = 0.08
bevel.segments = 4
with bpy.context.temp_override(object=box, active_object=box):
    bpy.ops.object.modifier_apply(modifier=bevel.name)
for poly in box.data.polygons:
    poly.use_smooth = True
box.data.materials.append(paint_material())

bpy.ops.mesh.primitive_plane_add(size=3.0)
floor = bpy.context.active_object
floor.name = "Floor"
floor.data.materials.append(floor_material())

props = bpy.context.scene.bnitjs_export
props.write_graphs = True
props.bake_pbr = True
props.bake_unsupported = True
props.bake_resolution = 1024
props.bake_samples = 64

bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, "painted.glb"), export_format="GLB")
