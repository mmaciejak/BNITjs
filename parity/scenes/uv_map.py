"""UV Map node and Texture Coordinate > UV with a second UV map ("Detail": rotated, scaled).

DETAIL: UV Map "Detail". FIRST: UV Map "UVMap". EMPTY_NAME: UV Map with no name (active
render map, set to Detail). TEXCOORD_RENDER: Texture Coordinate > UV with Detail as the active
render map.
"""

from _common import emission_material

VARIANTS = ["DETAIL", "FIRST", "EMPTY_NAME", "TEXCOORD_RENDER"]


def build(variant):
    mat, nodes, links, color_in = emission_material("uv_map")
    if variant == "TEXCOORD_RENDER":
        coord = nodes.new("ShaderNodeTexCoord")
        links.new(coord.outputs["UV"], color_in)
        return mat
    node = nodes.new("ShaderNodeUVMap")
    node.uv_map = {"DETAIL": "Detail", "FIRST": "UVMap", "EMPTY_NAME": ""}[variant]
    links.new(node.outputs["UV"], color_in)
    return mat


def setup(plane, variant):
    layers = plane.data.uv_layers
    detail = layers.new(name="Detail")
    for loop in detail.data:
        u, v = loop.uv
        loop.uv = (0.2 + 0.6 * v, 0.9 - 0.7 * u)
    if variant in ("EMPTY_NAME", "TEXCOORD_RENDER"):
        detail.active_render = True
