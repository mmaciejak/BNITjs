"""Walk a material node tree and serialise it to the graph format (schema/graph.schema.json).

The result is a flat graph that the three.js runtime can evaluate directly:

- node groups are inlined; node ids are paths such as ``"Wood/Noise Texture"``;
- reroutes, frames and Group Input/Output nodes are removed;
- muted nodes are replaced by their pass-through (Blender's internal links);
- muted and invalid links, and links to unavailable sockets, are dropped;
- nodes that do not reach the active Material Output are pruned;
- unlinked group inputs become ``BSW_Value`` constant nodes, so that a group input can later be
  exposed as a live parameter (Phase 3).

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


def _rna_is_default(owner, prop):
    value = getattr(owner, prop.identifier)
    if prop.type == "ENUM":
        return (set(value) == set(prop.default_flag)) if prop.is_enum_flag else value == prop.default
    if getattr(prop, "is_array", False) and prop.array_length > 0:
        return all(abs(a - b) < 1e-7 for a, b in zip(value, prop.default_array, strict=False))
    if prop.type in {"BOOLEAN", "INT", "FLOAT"}:
        return value == prop.default
    if prop.type == "STRING":
        return value == prop.default
    return True


def _non_default_struct(struct_value, skip=()):
    """Plain properties of an RNA struct that differ from their defaults, or None."""
    out = {}
    for prop in struct_value.bl_rna.properties:
        if prop.identifier in skip or prop.identifier == "rna_type" or prop.type in {"POINTER", "COLLECTION"}:
            continue
        if not _rna_is_default(struct_value, prop):
            value = _rna_value(struct_value, prop)
            if value is not None:
                out[prop.identifier] = value
    return out or None


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
                if include_data:
                    data["curveMapping"] = sampling.curve_mapping(value)
            elif ident == "image":
                props["image"] = _image_ref(value)
            elif ident == "texture_mapping":
                tm = _non_default_struct(value)
                if tm:
                    props["textureMapping"] = tm
            elif ident == "color_mapping":
                cm = _non_default_struct(value, skip={"color_ramp"})
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
        self._emitted = set()

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
        return self._const(const_id, outer.type, socket_value(outer), f"{group_node.name}: {outer.name}")

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
        outputs = {s.identifier: {"name": s.name, "type": s.type} for s in node.outputs if _available(s)}
        if inputs:
            entry["inputs"] = inputs
        if outputs:
            entry["outputs"] = outputs
        return node_id


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
        "output": output_id,
        "nodes": builder.nodes,
    }
    if builder.links:
        graph["links"] = builder.links

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
