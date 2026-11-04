"""Build the configurator asset and export it with the add-on.

    blender -b --factory-startup --python examples/configurator/make_asset.py

Writes examples/configurator/tiles.glb: a smooth sphere whose material is a "$Tiles" group
(Scale, Color A, Color B, Gloss), so the runtime exposes those four as live parameters.
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

group = bpy.data.node_groups.new("Tiles", "ShaderNodeTree")
for name, kind in [
    ("Scale", "NodeSocketFloat"),
    ("Color A", "NodeSocketColor"),
    ("Color B", "NodeSocketColor"),
    ("Gloss", "NodeSocketFloat"),
]:
    group.interface.new_socket(name, in_out="INPUT", socket_type=kind)
group.interface.new_socket("Color", in_out="OUTPUT", socket_type="NodeSocketColor")
group.interface.new_socket("Roughness", in_out="OUTPUT", socket_type="NodeSocketFloat")
group.interface.items_tree["Scale"].min_value = 1.0
group.interface.items_tree["Scale"].max_value = 24.0
group.interface.items_tree["Gloss"].min_value = 0.0
group.interface.items_tree["Gloss"].max_value = 1.0
gi, go = group.nodes.new("NodeGroupInput"), group.nodes.new("NodeGroupOutput")
coord = group.nodes.new("ShaderNodeTexCoord")
checker = group.nodes.new("ShaderNodeTexChecker")
grad = group.nodes.new("ShaderNodeTexGradient")
grad.gradient_type = "SPHERICAL"
shade = group.nodes.new("ShaderNodeMix")
shade.data_type = "RGBA"
shade.blend_type = "MULTIPLY"
invert = group.nodes.new("ShaderNodeMath")
invert.operation = "SUBTRACT"
invert.inputs[0].default_value = 1.0
group.links.new(coord.outputs["UV"], checker.inputs["Vector"])
group.links.new(gi.outputs["Scale"], checker.inputs["Scale"])
group.links.new(gi.outputs["Color A"], checker.inputs["Color1"])
group.links.new(gi.outputs["Color B"], checker.inputs["Color2"])
group.links.new(coord.outputs["Object"], grad.inputs["Vector"])
ins = {s.identifier: s for s in shade.inputs}
shade.inputs[0].default_value = 0.35
group.links.new(checker.outputs["Color"], ins["A_Color"])
group.links.new(grad.outputs["Color"], ins["B_Color"])
group.links.new(next(s for s in shade.outputs if s.identifier == "Result_Color"), go.inputs["Color"])
group.links.new(gi.outputs["Gloss"], invert.inputs[1])
group.links.new(invert.outputs[0], go.inputs["Roughness"])

mat = bpy.data.materials.new("Tiles")
if bpy.app.version < (5, 0, 0):
    mat.use_nodes = True
nodes, links = mat.node_tree.nodes, mat.node_tree.links
nodes.clear()
out = nodes.new("ShaderNodeOutputMaterial")
bsdf = nodes.new("ShaderNodeBsdfPrincipled")
tiles = nodes.new("ShaderNodeGroup")
tiles.node_tree = group
tiles.label = "$Tiles"
tiles.inputs["Scale"].default_value = 8.0
tiles.inputs["Color A"].default_value = (0.8, 0.45, 0.12, 1.0)
tiles.inputs["Color B"].default_value = (0.05, 0.12, 0.35, 1.0)
tiles.inputs["Gloss"].default_value = 0.6
links.new(tiles.outputs["Color"], bsdf.inputs["Base Color"])
links.new(tiles.outputs["Roughness"], bsdf.inputs["Roughness"])
links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.0)
sphere = bpy.context.active_object
bpy.ops.object.shade_smooth()
sphere.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, "tiles.glb"), export_format="GLB")
print("wrote examples/configurator/tiles.glb")
