"""Vector Transform between World, Object and Camera space, for points, vectors and normals.

The plane is rotated (0.5 rad about Z) and scaled (1.3, 0.8, 1), so Object and World differ. The
input is the Object coordinate (points) or a constant (vectors, normals); the result is shown as
v × 0.3 + 0.5.
"""

from _common import emission_material

# variant: (type, from, to, input)
SPECS = {
    "POINT_OBJECT_WORLD": ("POINT", "OBJECT", "WORLD", "object"),
    "POINT_WORLD_OBJECT": ("POINT", "WORLD", "OBJECT", "object"),
    "POINT_WORLD_CAMERA": ("POINT", "WORLD", "CAMERA", "object"),
    "POINT_CAMERA_OBJECT": ("POINT", "CAMERA", "OBJECT", "object"),
    "VECTOR_OBJECT_WORLD": ("VECTOR", "OBJECT", "WORLD", (0.9, 0.5, 0.2)),
    "VECTOR_WORLD_CAMERA": ("VECTOR", "WORLD", "CAMERA", (0.9, 0.5, 0.2)),
    "NORMAL_OBJECT_WORLD": ("NORMAL", "OBJECT", "WORLD", (0.6, 0.3, 0.7)),
    "NORMAL_WORLD_OBJECT": ("NORMAL", "WORLD", "OBJECT", (0.6, 0.3, 0.7)),
}
VARIANTS = list(SPECS)


def setup(plane, variant):
    plane.rotation_euler = (0.0, 0.0, 0.5)
    plane.scale = (1.3, 0.8, 1.0)


def build(variant):
    kind, src, dst, value = SPECS[variant]
    mat, nodes, links, color_in = emission_material("vector_transform")
    node = nodes.new("ShaderNodeVectorTransform")
    node.vector_type, node.convert_from, node.convert_to = kind, src, dst
    if value == "object":
        coord = nodes.new("ShaderNodeTexCoord")
        links.new(coord.outputs["Object"], node.inputs["Vector"])
    else:
        node.inputs["Vector"].default_value = value
    remap = nodes.new("ShaderNodeVectorMath")
    remap.operation = "MULTIPLY_ADD"
    remap.inputs[1].default_value = (0.3, 0.3, 0.3)
    remap.inputs[2].default_value = (0.5, 0.5, 0.5)
    links.new(node.outputs["Vector"], remap.inputs[0])
    links.new(remap.outputs[0], color_in)
    return mat
