"""Nodes the runtime cannot evaluate live, baked by the exporter, on image_box's bumpy heightfield
(with a UV map over the 2×2 square, which the bake needs).

BEVEL: Bevel's Normal (radius 0.05) × 0.5 + 0.5, so negative components exercise the bake's RGBE
offset. AO: Ambient Occlusion's AO output: the heightfield occludes itself.
"""

from _common import by_id, emission_material
from image_box import setup as bumpy

VARIANTS = ["BEVEL", "AO"]


def setup(plane, variant):
    bumpy(plane, variant)
    mesh = plane.data
    uv = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        x, y, _ = mesh.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((x + 1) / 2, (y + 1) / 2)


def build(variant):
    mat, nodes, links, color_in = emission_material("baked")
    if variant == "BEVEL":
        bevel = nodes.new("ShaderNodeBevel")
        by_id(bevel.inputs)["Radius"].default_value = 0.05
        remap = nodes.new("ShaderNodeVectorMath")
        remap.operation = "MULTIPLY_ADD"
        remap.inputs[1].default_value = (0.5, 0.5, 0.5)
        remap.inputs[2].default_value = (0.5, 0.5, 0.5)
        links.new(bevel.outputs["Normal"], remap.inputs[0])
        links.new(remap.outputs[0], color_in)
    else:
        ao = nodes.new("ShaderNodeAmbientOcclusion")
        links.new(ao.outputs["AO"], color_in)
    return mat
