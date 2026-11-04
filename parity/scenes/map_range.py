"""Map Range: every interpolation type, float and vector, plus a reversed source range.

Float: x ∈ [-2, 2] mapped from [-1, 1.5] to [-1.5, 2] (steps 3, clamp on).
Vector: Generated mapped from (0.2, 0.8, 0) – (0.8, 0.1, 1) to (-1, 0, 0.5) – (1.5, 1, 0).
"""

from _common import emission_material, show_signed, signed_inputs

VARIANTS = [
    "LINEAR", "STEPPED", "SMOOTHSTEP", "SMOOTHERSTEP", "LINEAR_NOCLAMP", "SMOOTHSTEP_REVERSED",
    "VECTOR_LINEAR", "VECTOR_STEPPED", "VECTOR_SMOOTHSTEP", "VECTOR_SMOOTHERSTEP",
]  # fmt: skip


def build(variant):
    mat, nodes, links, color_in = emission_material("map_range")
    node = nodes.new("ShaderNodeMapRange")
    kind = variant.replace("VECTOR_", "").replace("_NOCLAMP", "").replace("_REVERSED", "")
    node.interpolation_type = kind
    node.clamp = not variant.endswith("_NOCLAMP")
    if variant.startswith("VECTOR_"):
        node.data_type = "FLOAT_VECTOR"
        coord = nodes.new("ShaderNodeTexCoord")
        ins = {s.identifier: s for s in node.inputs}
        links.new(coord.outputs["Generated"], ins["Vector"])
        ins["From_Min_FLOAT3"].default_value = (0.2, 0.8, 0.0)
        ins["From_Max_FLOAT3"].default_value = (0.8, 0.1, 1.0)
        ins["To_Min_FLOAT3"].default_value = (-1.0, 0.0, 0.5)
        ins["To_Max_FLOAT3"].default_value = (1.5, 1.0, 0.0)
        ins["Steps_FLOAT3"].default_value = (3.0, 5.0, 2.0)
        remap = nodes.new("ShaderNodeMapping")
        remap.inputs["Scale"].default_value = (0.25, 0.25, 0.25)
        remap.inputs["Location"].default_value = (0.5, 0.5, 0.5)
        links.new(node.outputs["Vector"], remap.inputs["Vector"])
        links.new(remap.outputs["Vector"], color_in)
        return mat
    sep = signed_inputs(nodes, links)
    # By identifier: Blender 5.x hides sockets the current mode doesn't use from name lookup.
    ins = {s.identifier: s for s in node.inputs}
    links.new(sep.outputs["X"], ins["Value"])
    lo, hi = (1.5, -1.0) if variant.endswith("_REVERSED") else (-1.0, 1.5)
    ins["From Min"].default_value = lo
    ins["From Max"].default_value = hi
    ins["To Min"].default_value = -1.5
    ins["To Max"].default_value = 2.0
    ins["Steps"].default_value = 3.0
    show_signed(nodes, links, node.outputs["Result"], color_in)
    return mat
