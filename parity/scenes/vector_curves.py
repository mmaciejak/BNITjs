"""Vector Curves on Generated mapped to [-1.5, 1.5] (outside the default [-1, 1] range).

EXTRAPOLATED and HORIZONTAL extend; shown as v × 0.25 + 0.5.
"""

from _common import emission_material

VARIANTS = ["EXTRAPOLATED", "HORIZONTAL"]


def build(variant):
    mat, nodes, links, color_in = emission_material("vector_curves")
    coord = nodes.new("ShaderNodeTexCoord")
    scale = nodes.new("ShaderNodeMapping")
    scale.inputs["Scale"].default_value = (3.0, 3.0, 3.0)
    scale.inputs["Location"].default_value = (-1.5, -1.5, -1.5)
    links.new(coord.outputs["Generated"], scale.inputs["Vector"])
    node = nodes.new("ShaderNodeVectorCurve")
    m = node.mapping
    m.curves[0].points.new(0.2, -0.6)
    m.curves[1].points.new(-0.4, 0.5)
    m.curves[2].points.new(0.0, 0.8)
    m.extend = variant
    m.update()
    links.new(scale.outputs["Vector"], node.inputs["Vector"])
    remap = nodes.new("ShaderNodeMapping")
    remap.inputs["Scale"].default_value = (0.25, 0.25, 0.25)
    remap.inputs["Location"].default_value = (0.5, 0.5, 0.5)
    links.new(node.outputs["Vector"], remap.inputs["Vector"])
    links.new(remap.outputs["Vector"], color_in)
    return mat
