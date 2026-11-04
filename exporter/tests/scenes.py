"""Test materials built from Python, shared by the exporter tests and tests/make_fixtures.py.

Building scenes in code (instead of committing .blend files) keeps them readable, diffable and
identical on every supported Blender version.
"""

import bpy


def new_material(name):
    """An empty node material containing only a Material Output."""
    mat = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    nodes.new("ShaderNodeOutputMaterial")
    return mat


def _sock(sockets, identifier):
    return next(s for s in sockets if s.identifier == identifier)


def _out(mat):
    return mat.node_tree.nodes["Material Output"]


def _principled(mat):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], _out(mat).inputs["Surface"])
    return bsdf


def uv_mapping():
    """UV → Mapping → Principled Base Color (the Phase 2 'done' material)."""
    mat = new_material("uv_mapping")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = _principled(mat)
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Location"].default_value = (0.25, 0.5, 0.0)
    mapping.inputs["Scale"].default_value = (2.0, 3.0, 1.0)
    links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], bsdf.inputs["Base Color"])
    return mat


def emission_rgb():
    """Color → Emission (the parity harness's unlit setup)."""
    mat = new_material("emission_rgb")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    emission = nodes.new("ShaderNodeEmission")
    rgb = nodes.new("ShaderNodeRGB")
    rgb.outputs[0].default_value = (0.8, 0.2, 0.1, 1.0)
    links.new(rgb.outputs[0], emission.inputs["Color"])
    links.new(emission.outputs[0], _out(mat).inputs["Surface"])
    return mat


def reroutes_frames_unused():
    """Value → Reroute → Reroute → Roughness, inside a frame, plus an unconnected Noise."""
    mat = new_material("reroutes_frames_unused")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = _principled(mat)
    value = nodes.new("ShaderNodeValue")
    value.outputs[0].default_value = 0.42
    r1 = nodes.new("NodeReroute")
    r2 = nodes.new("NodeReroute")
    frame = nodes.new("NodeFrame")
    value.parent = frame
    links.new(value.outputs[0], r1.inputs[0])
    links.new(r1.outputs[0], r2.inputs[0])
    links.new(r2.outputs[0], bsdf.inputs["Roughness"])
    nodes.new("ShaderNodeTexNoise")  # not connected: must be pruned
    dangling = nodes.new("NodeReroute")  # unlinked reroute into Metallic: becomes a constant
    links.new(dangling.outputs[0], bsdf.inputs["Metallic"])
    return mat


def muted_node_and_link():
    """A muted Mix (color) passes A through; a muted link is ignored."""
    mat = new_material("muted_node_and_link")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = _principled(mat)
    a = nodes.new("ShaderNodeRGB")
    a.name = "A"
    b = nodes.new("ShaderNodeRGB")
    b.name = "B"
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    links.new(a.outputs[0], _sock(mix.inputs, "A_Color"))
    links.new(b.outputs[0], _sock(mix.inputs, "B_Color"))
    links.new(_sock(mix.outputs, "Result_Color"), bsdf.inputs["Base Color"])
    mix.mute = True
    value = nodes.new("ShaderNodeValue")
    muted = links.new(value.outputs[0], bsdf.inputs["Roughness"])
    muted.is_muted = True
    return mat


def _group_tree(name, inputs, outputs):
    tree = bpy.data.node_groups.new(name, "ShaderNodeTree")
    for sock_name, sock_type in inputs:
        tree.interface.new_socket(sock_name, in_out="INPUT", socket_type=sock_type)
    for sock_name, sock_type in outputs:
        tree.interface.new_socket(sock_name, in_out="OUTPUT", socket_type=sock_type)
    tree.nodes.new("NodeGroupInput")
    tree.nodes.new("NodeGroupOutput")
    return tree


def nested_groups():
    """Value → Outer[Inner[Scale × Tint.r]] → Roughness; Tint is left unlinked (becomes a BSW_Value)."""
    inner = _group_tree(
        "Inner", [("Scale", "NodeSocketFloat"), ("Tint", "NodeSocketColor")], [("Fac", "NodeSocketFloat")]
    )
    gi, go = inner.nodes["Group Input"], inner.nodes["Group Output"]
    sep = inner.nodes.new("ShaderNodeSeparateColor")
    math = inner.nodes.new("ShaderNodeMath")
    math.operation = "MULTIPLY"
    inner.links.new(gi.outputs["Tint"], sep.inputs[0])
    inner.links.new(gi.outputs["Scale"], math.inputs[0])
    inner.links.new(sep.outputs[0], math.inputs[1])
    inner.links.new(math.outputs[0], go.inputs["Fac"])

    outer = _group_tree("Outer", [("Scale", "NodeSocketFloat")], [("Fac", "NodeSocketFloat")])
    gi, go = outer.nodes["Group Input"], outer.nodes["Group Output"]
    node = outer.nodes.new("ShaderNodeGroup")
    node.node_tree = inner
    node.name = "Inner"
    node.inputs["Tint"].default_value = (0.5, 0.25, 0.125, 1.0)
    outer.links.new(gi.outputs["Scale"], node.inputs["Scale"])
    outer.links.new(node.outputs["Fac"], go.inputs["Fac"])

    mat = new_material("nested_groups")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = _principled(mat)
    value = nodes.new("ShaderNodeValue")
    value.outputs[0].default_value = 3.0
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = outer
    group.name = "Outer"
    links.new(value.outputs[0], group.inputs["Scale"])
    links.new(group.outputs["Fac"], bsdf.inputs["Roughness"])
    return mat


def ramps_and_curves():
    """Color Ramp, Float Curve, RGB Curves and Vector Curves, all reaching the output."""
    mat = new_material("ramps_and_curves")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = _principled(mat)
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["UV"], sep.inputs[0])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.1, 0.0, 0.3, 1.0)
    ramp.color_ramp.elements.new(0.4).color = (1.0, 0.5, 0.0, 1.0)
    ramp.color_ramp.interpolation = "EASE"
    links.new(sep.outputs["X"], ramp.inputs["Fac"])

    rgb_curves = nodes.new("ShaderNodeRGBCurve")
    rgb_curves.mapping.curves[3].points.new(0.3, 0.7)
    links.new(ramp.outputs["Color"], rgb_curves.inputs["Color"])
    links.new(rgb_curves.outputs["Color"], bsdf.inputs["Base Color"])

    float_curve = nodes.new("ShaderNodeFloatCurve")
    float_curve.mapping.curves[0].points.new(0.5, 0.9)
    links.new(sep.outputs["Y"], float_curve.inputs["Value"])
    links.new(float_curve.outputs["Value"], bsdf.inputs["Roughness"])

    vector_curves = nodes.new("ShaderNodeVectorCurve")
    vector_curves.mapping.curves[0].points.new(0.2, -0.6)
    links.new(coord.outputs["Normal"], vector_curves.inputs["Vector"])
    links.new(vector_curves.outputs["Vector"], bsdf.inputs["Emission Color"])
    return mat


def baked_node():
    """Ambient Occlusion (always baked, never live) into Base Color."""
    mat = new_material("baked_node")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = _principled(mat)
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    links.new(ao.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


ALL = [
    uv_mapping,
    emission_rgb,
    reroutes_frames_unused,
    muted_node_and_link,
    nested_groups,
    ramps_and_curves,
    baked_node,
]
