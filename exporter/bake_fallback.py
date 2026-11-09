"""Bake the outputs of nodes the runtime cannot evaluate live, and replace them in the graph.

For every linked, non-shader output of such a node (Ambient Occlusion, Bevel, Point Density, and
nodes that are not supported yet), Cycles bakes the value into a float image in the UV space of an
object that uses the material. In the exported graph the node is replaced by an Image Texture on
that UV map, so everything downstream of it stays live.

The bake runs on copies: a temporary scene holds a copy of the object (with a copy of its mesh) and
a copy of the material whose active output is ``socket → Emission``. The other visible objects of
the scene are linked into the temporary scene, so Ambient Occlusion sees them. The user's data is
not changed.
"""

import bpy
import numpy as np

from .graph_export import unsupported_nodes

_SOCKET_TYPES = {
    "VALUE": "NodeSocketFloat",
    "INT": "NodeSocketInt",
    "BOOLEAN": "NodeSocketBool",
    "VECTOR": "NodeSocketVector",
    "RGBA": "NodeSocketColor",
}
_RENDERABLE = {"MESH", "CURVE", "SURFACE", "META", "FONT", "EMPTY", "VOLUME", "CURVES", "POINTCLOUD"}


def bake_targets(graph):
    """(node id, output identifier) of every linked non-shader output of a node that isn't live."""
    unsupported = {u["id"] for u in unsupported_nodes(graph)}
    targets = []
    for link in graph.get("links", []):
        node_id, output = link["from"]
        if node_id not in unsupported or (node_id, output) in targets:
            continue
        socket = graph["nodes"][node_id].get("outputs", {}).get(output, {})
        if socket.get("type") in _SOCKET_TYPES:
            targets.append((node_id, output))
    return targets


def bake_object(material, scene):
    """The object to bake ``material`` on: a visible mesh of ``scene`` that uses it and has a UV map,
    preferring selected objects. Returns (object, other users of the material)."""
    users = [
        obj
        for obj in scene.objects
        if obj.type == "MESH" and any(slot.material == material for slot in obj.material_slots)
    ]
    candidates = [obj for obj in users if obj.data.uv_layers]
    candidates.sort(key=lambda obj: (not obj.select_get(), not obj.visible_get(), obj.name))
    if not candidates:
        return None, users
    return candidates[0], [obj for obj in users if obj is not candidates[0]]


def _find(nodes, name):
    return next((n for n in nodes if n.name == name), None)


def _by_identifier(sockets, identifier):
    return next((s for s in sockets if s.identifier == identifier), None)


def _route_to_top(tree, groups, node_name, output_id):
    """The output socket ``output_id`` of node ``node_name`` inside nested groups ``groups`` of
    ``tree``, made reachable from ``tree`` itself: each group on the way is copied and gets a new
    output. Returns the socket in ``tree``, or None."""
    chain = []  # group nodes, outermost first
    current = tree
    for name in groups:
        group_node = _find(current.nodes, name)
        if group_node is None or group_node.node_tree is None:
            return None
        group_node.node_tree = group_node.node_tree.copy()
        chain.append(group_node)
        current = group_node.node_tree
    node = _find(current.nodes, node_name)
    if node is None:
        return None
    socket = _by_identifier(node.outputs, output_id)
    for group_node in reversed(chain):
        inner = group_node.node_tree
        socket_type = _SOCKET_TYPES.get(socket.type, "NodeSocketColor")
        item = inner.interface.new_socket(name="BNITjs bake", in_out="OUTPUT", socket_type=socket_type)
        out_node = next((n for n in inner.nodes if n.bl_idname == "NodeGroupOutput" and n.is_active_output), None)
        if out_node is None:
            out_node = next((n for n in inner.nodes if n.bl_idname == "NodeGroupOutput"), None)
        if out_node is None:
            out_node = inner.nodes.new("NodeGroupOutput")
            out_node.is_active_output = True
        inner.links.new(socket, _by_identifier(out_node.inputs, item.identifier))
        socket = _by_identifier(group_node.outputs, item.identifier)
        if socket is None:
            return None
    return socket


def _bake_material(material, image):
    """A copy of ``material`` whose only output is Emission(input), with ``image`` as the active
    Image Texture (Cycles bakes into it). Returns (copy, emission node)."""
    copy = material.copy()
    nodes, links = copy.node_tree.nodes, copy.node_tree.links
    for node in list(nodes):
        if node.bl_idname == "ShaderNodeOutputMaterial":
            nodes.remove(node)
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    output = nodes.new("ShaderNodeOutputMaterial")
    output.target = "ALL"
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    return copy, emission


def _placeholder_material(image):
    """Material for the object's other slots: Cycles needs an active image in each one."""
    mat = bpy.data.materials.new("bnitjs_bake_other")
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    return mat


class _BakeScene:
    """A temporary scene with a copy of ``obj`` and links to the other visible objects."""

    def __init__(self, obj, source_scene, settings):
        self.ids = []  # temporary data blocks, removed in reverse order
        self.scene = bpy.data.scenes.new("bnitjs_bake")
        self.ids.append(self.scene)
        scene = self.scene
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = settings.bake_samples
        scene.cycles.use_denoising = False
        scene.render.bake.margin = settings.bake_margin
        for other in source_scene.objects:
            if other is obj or other.type not in _RENDERABLE or other.hide_render or not other.visible_get():
                continue
            scene.collection.objects.link(other)
        self.mesh = obj.data.copy()
        self.ids.append(self.mesh)
        layers = self.mesh.uv_layers
        render = next((i for i, layer in enumerate(layers) if layer.active_render), 0)
        layers.active_index = render  # Cycles bakes into the active UV map
        self.uv_map = layers[render].name
        self.obj = obj.copy()
        self.ids.append(self.obj)
        self.obj.data = self.mesh
        self.obj.parent = None
        self.obj.animation_data_clear()
        self.obj.matrix_world = obj.matrix_world.copy()
        scene.collection.objects.link(self.obj)
        self.view_layer = scene.view_layers[0]
        for other in scene.objects:
            other.select_set(other is self.obj, view_layer=self.view_layer)
        self.view_layer.objects.active = self.obj

    def assign(self, material, replacement, placeholder):
        """Put ``replacement`` in every slot that holds ``material``, ``placeholder`` in the others."""
        for i, mat in enumerate(self.mesh.materials):
            self.mesh.materials[i] = replacement if mat == material else placeholder
        for slot in self.obj.material_slots:
            if slot.link == "OBJECT":
                slot.material = replacement if slot.material == material else placeholder

    def bake(self):
        with bpy.context.temp_override(
            scene=self.scene,
            view_layer=self.view_layer,
            active_object=self.obj,
            object=self.obj,
            selected_objects=[self.obj],
            selected_editable_objects=[self.obj],
        ):
            bpy.ops.object.bake(type="EMIT", margin_type="EXTEND", use_clear=True, target="IMAGE_TEXTURES")

    def own(self, block):
        self.ids.append(block)
        return block

    def close(self):
        for block in reversed(self.ids):
            collection = {
                bpy.types.Scene: bpy.data.scenes,
                bpy.types.Object: bpy.data.objects,
                bpy.types.Mesh: bpy.data.meshes,
                bpy.types.Material: bpy.data.materials,
                bpy.types.Image: bpy.data.images,
                bpy.types.ShaderNodeTree: bpy.data.node_groups,
            }.get(type(block))
            if collection is not None and block.name in collection:
                collection.remove(block)


def bake_sockets(material, obj, source_scene, targets, sources, settings):
    """Bake each (node id, output identifier) of ``targets`` on ``obj``.

    Returns ``(results, uv_map, warnings)``: ``results`` maps each target that could be baked to a
    float32 array of shape (height, width, 4), bottom row first.
    """
    results, warnings = {}, []
    size = settings.bake_resolution
    bake = _BakeScene(obj, source_scene, settings)
    try:
        image = bake.own(bpy.data.images.new("bnitjs_bake", size, size, alpha=True, float_buffer=True))
        image.colorspace_settings.name = "Non-Color"
        scratch = bake.own(bpy.data.images.new("bnitjs_bake_other", 4, 4, alpha=True, float_buffer=True))
        placeholder = bake.own(_placeholder_material(scratch))
        for node_id, output in targets:
            groups, name = sources[node_id]
            copy, emission = _bake_material(material, image)
            bake.own(copy)
            groups_before = set(bpy.data.node_groups)
            socket = _route_to_top(copy.node_tree, groups, name, output)
            for group in set(bpy.data.node_groups) - groups_before:
                bake.own(group)
            if socket is None:
                warnings.append(f"cannot find '{node_id}' to bake it")
                continue
            copy.node_tree.links.new(socket, emission.inputs["Color"])
            bake.assign(material, copy, placeholder)
            bake.bake()
            pixels = np.empty(size * size * 4, dtype=np.float32)
            image.pixels.foreach_get(pixels)
            results[(node_id, output)] = pixels.reshape(size, size, 4)
        return results, bake.uv_map, warnings
    finally:
        bake.close()


def replace_with_images(graph, baked, uv_map, embed):
    """Replace each baked output in ``graph`` by an Image Texture on ``uv_map`` and drop the nodes
    nothing uses any more.

    ``baked`` maps (node id, output identifier) to float pixels; ``embed(name, pixels)`` returns
    the image reference properties (``texture``, ``encoding``, ``offset``) or None on failure.
    """
    nodes = graph["nodes"]
    for (node_id, output), pixels in baked.items():
        source = nodes[node_id]
        out_name = source["outputs"][output]["name"]
        label = f"{source['name']} ({out_name}, baked)"
        image_ref = embed(label, pixels)
        if image_ref is None:
            continue
        uv_id = f"{node_id}:baked:{output}:uv"
        tex_id = f"{node_id}:baked:{output}"
        nodes[uv_id] = {
            "type": "ShaderNodeUVMap",
            "name": f"{label} UV",
            "properties": {"uv_map": uv_map, "from_instancer": False},
            "outputs": {"UV": {"name": "UV", "type": "VECTOR"}},
        }
        nodes[tex_id] = {
            "type": "ShaderNodeTexImage",
            "name": label,
            "baked": {"node": node_id, "type": source["type"], "output": output},
            "properties": {
                "image": {
                    "name": label,
                    "source": "GENERATED",
                    "colorspace": "Non-Color",
                    "alphaMode": "NONE",
                    **image_ref,
                },
                "interpolation": "Linear",
                "projection": "FLAT",
                "extension": "EXTEND",
            },
            "inputs": {"Vector": {"name": "Vector", "type": "VECTOR", "value": [0.0, 0.0, 0.0]}},
            "outputs": {"Color": {"name": "Color", "type": "RGBA"}, "Alpha": {"name": "Alpha", "type": "VALUE"}},
        }
        for link in graph["links"]:
            if link["from"] == [node_id, output]:
                link["from"] = [tex_id, "Color"]
        graph["links"].append({"from": [uv_id, "UV"], "to": [tex_id, "Vector"]})
    prune(graph)


def prune(graph):
    """Remove nodes (and their links and parameters) that do not reach the graph's output."""
    feeds = {}
    for link in graph.get("links", []):
        feeds.setdefault(link["to"][0], []).append(link["from"][0])
    keep, stack = set(), [graph["output"]]
    while stack:
        node_id = stack.pop()
        if node_id in keep:
            continue
        keep.add(node_id)
        stack.extend(feeds.get(node_id, []))
    graph["nodes"] = {k: v for k, v in graph["nodes"].items() if k in keep}
    links = [link for link in graph.get("links", []) if link["from"][0] in keep and link["to"][0] in keep]
    if links:
        graph["links"] = links
    else:
        graph.pop("links", None)
    params = [p for p in graph.get("params", []) if p["node"] in keep]
    if params:
        graph["params"] = params
    else:
        graph.pop("params", None)


def bake_unsupported(material, graph, report, scene, settings, embed):
    """Bake the unsupported outputs of ``material``'s exported ``graph`` and rewrite the graph.

    Returns (baked node ids, warnings).
    """
    targets = bake_targets(graph)
    if not targets:
        return [], []
    obj, others = bake_object(material, scene)
    if obj is None:
        message = f"Material '{material.name}': no mesh with a UV map uses it, so its unsupported nodes are not baked"
        return [], [message]
    warnings = []
    if others:
        warnings.append(
            f"Material '{material.name}' is baked on '{obj.name}'; "
            f"{len(others)} other object(s) reuse that texture through their own UV maps"
        )
    baked, uv_map, bake_warnings = bake_sockets(material, obj, scene, targets, report["sources"], settings)
    warnings += [f"Material '{material.name}': {w}" for w in bake_warnings]
    params_before = {p["name"] for p in graph.get("params", [])}
    replace_with_images(graph, baked, uv_map, embed)
    lost = params_before - {p["name"] for p in graph.get("params", [])}
    if lost:
        warnings.append(
            f"Material '{material.name}': parameters that only fed baked nodes are dropped: {', '.join(sorted(lost))}"
        )
    return sorted({node_id for node_id, _ in baked}), warnings
