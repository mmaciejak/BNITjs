"""Color Attribute and Attribute (by name) on a mesh with a float corner color attribute.

The plane gets a 2×2-cell grid so the per-corner colors interpolate across faces.
"""

from _common import emission_material

VARIANTS = ["COLOR_ATTRIBUTE", "COLOR_ATTRIBUTE_ALPHA", "ATTRIBUTE_COLOR", "ATTRIBUTE_FAC", "ATTRIBUTE_UV"]


def build(variant):
    mat, nodes, links, color_in = emission_material("color_attribute")
    if variant.startswith("COLOR_ATTRIBUTE"):
        node = nodes.new("ShaderNodeVertexColor")
        out = "Alpha" if variant.endswith("ALPHA") else "Color"
    else:
        node = nodes.new("ShaderNodeAttribute")
        node.attribute_name = "UVMap" if variant == "ATTRIBUTE_UV" else "Paint"
        out = {"ATTRIBUTE_COLOR": "Color", "ATTRIBUTE_FAC": "Fac", "ATTRIBUTE_UV": "Vector"}[variant]
    links.new(node.outputs[out], color_in)
    return mat


def setup(plane, variant):
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(plane.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    bm.to_mesh(plane.data)
    bm.free()
    paint = plane.data.color_attributes.new("Paint", "FLOAT_COLOR", "CORNER")
    for i, loop in enumerate(plane.data.loops):
        co = plane.data.vertices[loop.vertex_index].co
        paint.data[i].color = (
            0.5 + 0.45 * co.x,
            0.5 + 0.45 * co.y,
            0.3 + 0.2 * co.x * co.y,
            0.25 + 0.7 * (co.x + 1) / 2,
        )
    plane.data.color_attributes.active_color = paint
