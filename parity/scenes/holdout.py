"""Holdout as the whole Surface: Cycles writes black with alpha 0; the browser cuts a hole
(transparent black, no blending) in the canvas, which the harness sees over a black page."""

from _common import new_material


def build():
    mat = new_material("holdout")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    node = nodes.new("ShaderNodeHoldout")
    links.new(node.outputs["Holdout"], nodes["Material Output"].inputs["Surface"])
    return mat
