"""Walk a material node tree and serialise it to the graph format (schema/graph.schema.json).

The result is a flat graph that the three.js runtime can evaluate directly:

- node groups are inlined; node ids are paths such as ``"Wood/Noise Texture"``;
- reroutes, frames and Group Input/Output nodes are removed;
- muted nodes are replaced by their pass-through (Blender's internal links);
- muted and invalid links, and links to unavailable sockets, are dropped;
- nodes that do not reach the active Material Output are pruned;
- unlinked group inputs become ``BSW_Value`` constant nodes.

Live parameters (``params``): a Value or Color node whose label starts with ``$`` is exposed as
a parameter named by the rest of the label (``$Grain Scale`` → ``Grain Scale``); a group node
whose label starts with ``$`` exposes each of its unlinked inputs as ``<label>/<input name>``
(with the group interface's min/max).

Every collection in the output is omitted when empty, and ``None`` is never written. The glTF
exporter strips empty collections and ``None`` values from extension data anyway.
"""

import sys

import bpy

from . import node_support, sampling
from .values import f32

GRAPH_FORMAT_VERSION = 1

# Synthetic node type for constants produced by flattening (unlinked group inputs, muted outputs).
VALUE_NODE = "BSW_Value"

_CURVE_KINDS = {"ShaderNodeRGBCurve": "RGB", "ShaderNodeVectorCurve": "VECTOR", "ShaderNodeFloatCurve": "FLOAT"}
_OUTPUT_VALUE_TYPES = {"ShaderNodeValue", "ShaderNodeRGB", "ShaderNodeNormal"}
_LAYOUT_TYPES = {"NodeReroute", "NodeFrame", "NodeGroupInput", "NodeGroupOutput"}
_BASE_PROPS = None


def _base_props():
    global _BASE_PROPS
    if _BASE_PROPS is None:
        _BASE_PROPS = {p.identifier for p in bpy.types.ShaderNode.bl_rna.properties}
    return _BASE_PROPS


# --------------------------------------------------------------------------- values


def to_json_value(value):
    """Convert an RNA value (number, bool, string, array, Euler, Color …) to JSON-safe data."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return f32(value)
    if isinstance(value, str):
        return value if value else None
    try:
        items = list(value)
    except TypeError:
        return None
    converted = [to_json_value(v) for v in items]
    if not converted or any(v is None for v in converted):
        return None
    return converted


def socket_value(socket):
    if not hasattr(socket, "default_value"):
        return None
    return to_json_value(socket.default_value)


def zero_value(socket_type):
    return {
        "VALUE": 0.0,
        "INT": 0,
        "BOOLEAN": False,
        "VECTOR": [0.0, 0.0, 0.0],
        "RGBA": [0.0, 0.0, 0.0, 1.0],
        "ROTATION": [0.0, 0.0, 0.0],
    }.get(socket_type)


# --------------------------------------------------------------------------- properties


def _rna_value(owner, prop):
    if prop.type == "ENUM":
        value = getattr(owner, prop.identifier)
        return sorted(value) if prop.is_enum_flag else value
    if prop.type in {"BOOLEAN", "INT", "FLOAT", "STRING"}:
        return to_json_value(getattr(owner, prop.identifier))
    return None


# The sidebar Texture Mapping / Color Mapping panels of texture nodes. Their RNA defaults don't
# match the real defaults, so changes are detected against these identity settings.
_TEXTURE_MAPPING_IDENTITY = {
    "vector_type": "POINT",
    "translation": (0.0, 0.0, 0.0),
    "rotation": (0.0, 0.0, 0.0),
    "scale": (1.0, 1.0, 1.0),
    "use_min": False,
    "use_max": False,
    "mapping_x": "X",
    "mapping_y": "Y",
    "mapping_z": "Z",
    "mapping": "FLAT",
}
_COLOR_MAPPING_IDENTITY = {
    "use_color_ramp": False,
    "brightness": 1.0,
    "contrast": 1.0,
    "saturation": 1.0,
    "blend_factor": 0.0,
}


def _changed(struct_value, identity):
    """Settings of struct_value that differ from identity (all of them, if any differs)."""

    def same(a, b):
        if isinstance(b, tuple):
            return all(abs(x - y) < 1e-6 for x, y in zip(a, b, strict=True))
        if isinstance(b, float):
            return abs(a - b) < 1e-6
        return a == b

    if all(same(getattr(struct_value, k), v) for k, v in identity.items()):
        return None
    return {k: to_json_value(getattr(struct_value, k)) for k in identity}


def _image_ref(image):
    if image is None:
        return None
    ref = {
        "name": image.name,
        "source": image.source,
        "colorspace": image.colorspace_settings.name,
        "alphaMode": image.alpha_mode,
    }
    if image.filepath:
        ref["filepath"] = image.filepath
    return ref


def node_properties(node, include_data):
    """Node-specific settings (enums, flags, numbers) plus sampled data blocks."""
    props, data = {}, {}
    for prop in node.bl_rna.properties:
        ident = prop.identifier
        if ident in _base_props() or prop.type == "COLLECTION":
            continue
        if prop.type == "POINTER":
            value = getattr(node, ident)
            if value is None:
                continue
            if ident == "color_ramp":
                if include_data:
                    data["colorRamp"] = sampling.color_ramp(value)
            elif ident == "mapping" and isinstance(value, bpy.types.CurveMapping):
                kind = _CURVE_KINDS.get(node.bl_idname)
                if include_data and kind:
                    data["curveMapping"] = sampling.curve_mapping(value, kind)
            elif ident == "image":
                props["image"] = _image_ref(value)
            elif ident == "texture_mapping":
                tm = _changed(value, _TEXTURE_MAPPING_IDENTITY)
                if tm:
                    props["textureMapping"] = tm
            elif ident == "color_mapping":
                cm = _changed(value, _COLOR_MAPPING_IDENTITY)
                if cm:
                    props["colorMapping"] = cm
            elif isinstance(value, bpy.types.ID):
                props[ident] = value.name
            continue
        value = _rna_value(node, prop)
        if value is not None:
            props[ident] = value
    return props, data


# --------------------------------------------------------------------------- tree helpers


def _available(socket):
    return socket.enabled


def _incoming_link(socket):
    """The link feeding an input socket, ignoring muted/invalid links and unavailable sockets."""
    for link in socket.links:
        if link.is_muted or not link.is_valid:
            continue
        if not _available(link.from_socket) or link.from_node.type == "FRAME":
            continue
        return link
    return None


def _material_output(tree):
    outputs = [n for n in tree.nodes if n.bl_idname == "ShaderNodeOutputMaterial" and not n.mute]
    for targets in (("EEVEE",), ("ALL",)):
        candidates = [n for n in outputs if n.target in targets]
        for n in candidates:
            if n.is_active_output:
                return n
        if candidates and targets == ("ALL",):
            return candidates[0]
    return None


def _group_output(tree):
    outputs = [n for n in tree.nodes if n.bl_idname == "NodeGroupOutput"]
    for n in outputs:
        if n.is_active_output:
            return n
    return outputs[0] if outputs else None


# Blender picks the pass-through input of a muted node by socket-type priority (higher is better).
_MUTE_PRIORITY = {
    "VALUE": ["VALUE", "INT", "BOOLEAN", "RGBA", "VECTOR"],
    "INT": ["INT", "VALUE", "BOOLEAN", "RGBA", "VECTOR"],
    "BOOLEAN": ["BOOLEAN", "INT", "VALUE", "RGBA", "VECTOR"],
    "VECTOR": ["VECTOR", "RGBA", "VALUE", "INT", "BOOLEAN"],
    "RGBA": ["RGBA", "VECTOR", "VALUE", "INT", "BOOLEAN"],
    "SHADER": ["SHADER"],
}


def mute_passthrough_input(node, output):
    """Input socket a muted node passes through to ``output``, or None.

    Uses Blender's own internal links when they are available. They can be missing on Blender
    4.2 for nodes created from Python, before the tree has been updated; in that case an
    approximation of Blender's rule is used: the best type match wins, and linked inputs are
    preferred.
    """
    for link in node.internal_links:
        if link.to_socket == output:
            return link.from_socket
    if node.internal_links:
        return None
    order = _MUTE_PRIORITY.get(output.type, [])
    best, best_key = None, None
    for socket in node.inputs:
        if not _available(socket) or socket.type not in order:
            continue
        key = (_incoming_link(socket) is not None, -order.index(socket.type))
        if best_key is None or key > best_key:
            best, best_key = socket, key
    return best


# --------------------------------------------------------------------------- flattening


class _Context:
    """One level of node-group nesting."""

    def __init__(self, tree, prefix="", group_node=None, parent=None):
        self.tree = tree
        self.prefix = prefix
        self.group_node = group_node
        self.parent = parent


class GraphBuilder:
    def __init__(self, include_data=True):
        self.include_data = include_data
        self.nodes = {}
        self.links = []
        self.warnings = []
        self.params = []
        self._emitted = set()

    def _add_param(self, name, node_id, socket_type, value, lo=None, hi=None):
        if any(p["name"] == name for p in self.params):
            self.warnings.append(f"Parameter '{name}' is defined twice; keeping the first")
            return
        param = {"name": name, "node": node_id, "type": socket_type}
        if value is not None:
            param["default"] = value
        if lo is not None:
            param["min"] = f32(lo)
        if hi is not None:
            param["max"] = f32(hi)
        self.params.append(param)

    # -- sources ------------------------------------------------------------

    def _const(self, node_id, socket_type, value, label):
        """A BSW_Value node; returns its (id, socket) source."""
        if node_id not in self.nodes:
            entry = {"type": VALUE_NODE, "name": label, "outputs": {"Value": {"name": "Value", "type": socket_type}}}
            if value is not None:
                entry["properties"] = {"value": value}
            self.nodes[node_id] = entry
        return (node_id, "Value")

    def resolve_input(self, socket, ctx):
        """Source feeding an input socket: (node_id, output_identifier), or None if unlinked."""
        link = _incoming_link(socket)
        if link is None:
            return None
        return self.resolve_output(link.from_node, link.from_socket, ctx)

    def resolve_output(self, node, socket, ctx):
        idname = node.bl_idname

        if idname == "NodeReroute":
            source = self.resolve_input(node.inputs[0], ctx)
            if source is None:
                return self._const(ctx.prefix + node.name, socket.type, zero_value(socket.type), node.name)
            return source

        if idname == "NodeGroupInput":
            return self._resolve_group_input(socket, ctx, node)

        if node.mute:
            passthrough = mute_passthrough_input(node, socket)
            if passthrough is None:
                return self._const(
                    f"{ctx.prefix}{node.name}:{socket.identifier}", socket.type, zero_value(socket.type), node.name
                )
            source = self.resolve_input(passthrough, ctx)
            if source is None:
                return self._const(
                    f"{ctx.prefix}{node.name}:{socket.identifier}",
                    passthrough.type,
                    socket_value(passthrough),
                    node.name,
                )
            return source

        if idname == "ShaderNodeGroup":
            return self._resolve_group_node(node, socket, ctx)

        node_id = self.emit(node, ctx)
        return (node_id, socket.identifier)

    def _resolve_group_input(self, socket, ctx, node):
        group_node = ctx.group_node
        if group_node is None:
            self.warnings.append(f"Group Input '{node.name}' outside a group is ignored")
            return None
        outer = next((s for s in group_node.inputs if s.identifier == socket.identifier), None)
        if outer is None:
            return None
        source = self.resolve_input(outer, ctx.parent)
        if source is not None:
            return source
        if outer.type == "SHADER":
            return None
        const_id = f"{ctx.parent.prefix}{group_node.name}/Group Input:{socket.identifier}"
        is_new = const_id not in self.nodes
        source = self._const(const_id, outer.type, socket_value(outer), f"{group_node.name}: {outer.name}")
        label = _param_label(group_node)
        if is_new and label is not None:
            lo, hi = _interface_range(group_node.node_tree, socket.identifier)
            self._add_param(f"{label}/{outer.name}", const_id, outer.type, socket_value(outer), lo, hi)
        return source

    def _resolve_group_node(self, node, socket, ctx):
        tree = node.node_tree
        if tree is None:
            return self._const(
                f"{ctx.prefix}{node.name}:{socket.identifier}", socket.type, zero_value(socket.type), node.name
            )
        inner = _Context(tree, f"{ctx.prefix}{node.name}/", node, ctx)
        output_node = _group_output(tree)
        inner_socket = None
        if output_node is not None:
            inner_socket = next((s for s in output_node.inputs if s.identifier == socket.identifier), None)
        if inner_socket is None:
            return self._const(
                f"{ctx.prefix}{node.name}:{socket.identifier}", socket.type, zero_value(socket.type), node.name
            )
        source = self.resolve_input(inner_socket, inner)
        if source is None:
            if inner_socket.type == "SHADER":
                return None
            const_id = f"{inner.prefix}{output_node.name}:{socket.identifier}"
            return self._const(const_id, inner_socket.type, socket_value(inner_socket), f"{node.name}: {socket.name}")
        return source

    # -- emission -----------------------------------------------------------

    def emit(self, node, ctx):
        node_id = ctx.prefix + node.name
        if node_id in self._emitted:
            return node_id
        self._emitted.add(node_id)

        entry = {"type": node.bl_idname, "name": node.name}
        if node.label:
            entry["label"] = node.label
        if ctx.group_node is not None:
            entry["group"] = ctx.prefix.rstrip("/")
        label = _param_label(node)
        if label is not None and node.bl_idname in ("ShaderNodeValue", "ShaderNodeRGB"):
            out = node.outputs[0]
            self._add_param(label, node_id, out.type, socket_value(out))
        props, data = node_properties(node, self.include_data)
        if props:
            entry["properties"] = props
        if data:
            entry["data"] = data
        self.nodes[node_id] = entry  # insert before inputs so ids stay stable

        inputs = {}
        for socket in node.inputs:
            if not _available(socket):
                continue
            item = {"name": socket.name, "type": socket.type}
            value = socket_value(socket)
            if value is not None:
                item["value"] = value
            inputs[socket.identifier] = item
            source = self.resolve_input(socket, ctx)
            if source is not None:
                self.links.append({"from": list(source), "to": [node_id, socket.identifier]})
        outputs = {}
        for socket in node.outputs:
            if not _available(socket):
                continue
            item = {"name": socket.name, "type": socket.type}
            # Value, Color and Normal nodes store their value on the output socket.
            if node.bl_idname in _OUTPUT_VALUE_TYPES:
                value = socket_value(socket)
                if value is not None:
                    item["value"] = value
            outputs[socket.identifier] = item
        if inputs:
            entry["inputs"] = inputs
        if outputs:
            entry["outputs"] = outputs
        return node_id


def _uv_maps(material, warnings):
    """UV map names (glTF TEXCOORD_i = uv_layers[i]) and the active render index, read from the
    meshes that use the material. Meshes that disagree get a warning; the first one wins."""
    layouts = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not any(slot.material == material for slot in obj.material_slots):
            continue
        layers = obj.data.uv_layers
        # uv_layers.active_render_index only exists in Blender 5.x; the per-layer flag works everywhere.
        active = next((i for i, layer in enumerate(layers) if layer.active_render), 0)
        layout = ([layer.name for layer in layers], active)
        if layout[0] and layout not in layouts:
            layouts.append(layout)
    if not layouts:
        return None
    if len(layouts) > 1:
        warnings.append(f"Material '{material.name}' is used by meshes with different UV map layouts")
    names, active = layouts[0]
    return {"names": names, "activeRender": active}


def _param_label(node):
    """Parameter name from a "$Name" label, or None."""
    label = (node.label or "").strip()
    if not label.startswith("$") or not label[1:].strip():
        return None
    return label[1:].strip()


def _interface_range(tree, identifier):
    """(min, max) of a float group input, or (None, None)."""
    if tree is None:
        return None, None
    for item in tree.interface.items_tree:
        if getattr(item, "identifier", None) == identifier and hasattr(item, "min_value"):
            if item.socket_type in ("NodeSocketFloat", "NodeSocketInt"):
                return item.min_value, item.max_value
    return None, None


def _addon_version():
    import os
    import tomllib

    path = os.path.join(os.path.dirname(__file__), "blender_manifest.toml")
    try:
        with open(path, "rb") as f:
            return tomllib.load(f).get("version", "0.0.0")
    except OSError:
        return "0.0.0"


def export_material_graph(material, include_data=True):
    """Build the graph dict for ``material``.

    Returns ``(graph, report)``. ``graph`` is None when the material has no node tree or no
    active Material Output. ``report`` is a dict with ``unsupported`` (node id, Blender type,
    display name and status for every node the runtime cannot evaluate live) and ``warnings``.
    """
    report = {"unsupported": [], "warnings": []}
    tree = material.node_tree if material is not None else None
    if tree is None:
        return None, report
    output = _material_output(tree)
    if output is None:
        report["warnings"].append(f"Material '{material.name}' has no active Material Output")
        return None, report

    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(max(limit, 10000))
    try:
        builder = GraphBuilder(include_data=include_data)
        output_id = builder.emit(output, _Context(tree))
    finally:
        sys.setrecursionlimit(limit)

    graph = {
        "version": GRAPH_FORMAT_VERSION,
        "generator": {"name": "blender_shader_web", "version": _addon_version(), "blender": bpy.app.version_string},
        "material": material.name,
        "materialPassIndex": material.pass_index,
        "output": output_id,
        "nodes": builder.nodes,
    }
    if builder.links:
        graph["links"] = builder.links
    if builder.params:
        graph["params"] = builder.params
    uv_maps = _uv_maps(material, builder.warnings)
    if uv_maps:
        graph["uvMaps"] = uv_maps

    for node_id, entry in builder.nodes.items():
        node_type = entry["type"]
        if node_type == VALUE_NODE or node_type in _LAYOUT_TYPES:
            continue
        status = node_support.STATUS.get(node_type, "unknown")
        if status not in node_support.LIVE:
            report["unsupported"].append(
                {
                    "id": node_id,
                    "type": node_type,
                    "name": node_support.NAME.get(node_type, node_type),
                    "status": status,
                }
            )
    report["warnings"].extend(builder.warnings)
    return graph, report
