"""Object Info outputs. Random for three object names (matches Cycles' name hash),
Location with the origin moved off the mesh, object Color/Alpha, Object and Material Index.
"""

from _common import emission_material

VARIANTS = [
    "RANDOM_PLANE",
    "RANDOM_ROCK",
    "RANDOM_LONGNAME",
    "LOCATION",
    "COLOR",
    "ALPHA",
    "OBJECT_INDEX",
    "MATERIAL_INDEX",
]
NAMES = {"RANDOM_PLANE": "Plane", "RANDOM_ROCK": "Rock", "RANDOM_LONGNAME": "Wooden Chair.017"}


def build(variant):
    mat, nodes, links, color_in = emission_material("object_info")
    info = nodes.new("ShaderNodeObjectInfo")
    mat.pass_index = 5
    if variant == "LOCATION":
        show = nodes.new("ShaderNodeMapping")
        show.inputs["Scale"].default_value = (0.5, 0.5, 0.5)
        show.inputs["Location"].default_value = (0.5, 0.5, 0.5)
        links.new(info.outputs["Location"], show.inputs["Vector"])
        links.new(show.outputs["Vector"], color_in)
    elif variant == "COLOR":
        links.new(info.outputs["Color"], color_in)
    elif variant in ("OBJECT_INDEX", "MATERIAL_INDEX", "ALPHA"):
        out = {"OBJECT_INDEX": "Object Index", "MATERIAL_INDEX": "Material Index", "ALPHA": "Alpha"}[variant]
        scale = nodes.new("ShaderNodeMath")
        scale.operation = "MULTIPLY"
        scale.inputs[1].default_value = 1.0 if variant == "ALPHA" else 0.1
        links.new(info.outputs[out], scale.inputs[0])
        links.new(scale.outputs[0], color_in)
    else:
        links.new(info.outputs["Random"], color_in)
    return mat


def setup(plane, variant):
    plane.name = NAMES.get(variant, "Plane")
    plane.color = (0.9, 0.35, 0.1, 0.4)
    plane.pass_index = 3
    if variant == "LOCATION":
        # Move the origin, keep the mesh where the camera sees it.
        offset = (0.3, -0.6, 0.5)
        plane.location = offset
        for v in plane.data.vertices:
            v.co.x -= offset[0]
            v.co.y -= offset[1]
            v.co.z -= offset[2]
        plane.data.update()
