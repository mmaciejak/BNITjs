"""Displacement on a flat 48×48 grid: Noise (Scale 2) as height, Midlevel 0.5, Scale 0.4.

BUMP_NORMAL: "Bump Only" (Blender's default) shows Geometry Normal × 0.5 + 0.5.
DISPLACE_POSITION / DISPLACE_WORLD: true displacement (object / world space) shows Geometry
Position × 0.3 + 0.5 (seen from above, so the z offset is the color). Cycles also recomputes the
displaced mesh's normals, which the runtime does not, so normals are not compared there.
VECTOR_OBJECT / VECTOR_WORLD: Vector Displacement of the Noise Color (Midlevel 0.5, Scale 0.4).
"""

import bpy
from _common import by_id, emission_material

VARIANTS = ["BUMP_NORMAL", "BUMP_WORLD", "DISPLACE_POSITION", "DISPLACE_WORLD", "VECTOR_OBJECT", "VECTOR_WORLD"]
N = 48


def setup(plane, variant):
    verts = [(-1 + 2 * i / N, -1 + 2 * j / N, 0.0) for j in range(N + 1) for i in range(N + 1)]
    faces = [(j * (N + 1) + i, j * (N + 1) + i + 1, (j + 1) * (N + 1) + i + 1, (j + 1) * (N + 1) + i)
             for j in range(N) for i in range(N)]  # fmt: skip
    mesh = bpy.data.meshes.new("Grid")
    mesh.from_pydata(verts, [], faces)
    for poly in mesh.polygons:
        poly.use_smooth = True
    for material in plane.data.materials:
        mesh.materials.append(material)
    plane.data = mesh


def build(variant):
    mat, nodes, links, color_in = emission_material("displacement")
    mat.displacement_method = "BUMP" if variant.startswith("BUMP") else "DISPLACEMENT"
    noise = nodes.new("ShaderNodeTexNoise")
    by_id(noise.inputs)["Scale"].default_value = 2.0
    by_id(noise.inputs)["Detail"].default_value = 1.0
    if variant.startswith("VECTOR"):
        disp = nodes.new("ShaderNodeVectorDisplacement")
        disp.space = "WORLD" if variant.endswith("WORLD") else "OBJECT"
        links.new(by_id(noise.outputs)["Color"], disp.inputs["Vector"])
    else:
        disp = nodes.new("ShaderNodeDisplacement")
        disp.space = "WORLD" if variant.endswith("WORLD") else "OBJECT"
        links.new(by_id(noise.outputs)["Fac"], disp.inputs["Height"])
    disp.inputs["Midlevel"].default_value = 0.5
    disp.inputs["Scale"].default_value = 0.4
    links.new(disp.outputs["Displacement"], nodes["Material Output"].inputs["Displacement"])
    geometry = nodes.new("ShaderNodeNewGeometry")
    remap = nodes.new("ShaderNodeVectorMath")
    remap.operation = "MULTIPLY_ADD"
    show_normal = variant.startswith("BUMP")
    gain = 0.5 if show_normal else 0.3
    remap.inputs[1].default_value = (gain, gain, gain)
    remap.inputs[2].default_value = (0.5, 0.5, 0.5)
    links.new(geometry.outputs["Normal" if show_normal else "Position"], remap.inputs[0])
    links.new(remap.outputs[0], color_in)
    return mat
