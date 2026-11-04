"""Material Properties panel that shows which nodes the three.js runtime can evaluate live."""

import bpy

from .graph_export import export_material_graph

STATUS_TEXT = {
    "planned": ("Not yet", "TIME"),
    "baked": ("Baked at export", "TEXTURE"),
    "not_planned": ("Not supported", "CANCEL"),
    "unknown": ("Unknown node", "QUESTION"),
}


def summarize(material):
    """Rows for the panel: (display name, count, status) for every node that isn't live, plus warnings.

    Returns ``(live_count, rows, warnings)``; ``live_count`` is None when nothing would be exported.
    """
    graph, report = export_material_graph(material, include_data=False)
    if graph is None:
        return None, [], report["warnings"]
    counts = {}
    for item in report["unsupported"]:
        key = (item["name"], item["status"])
        counts[key] = counts.get(key, 0) + 1
    rows = sorted(((name, n, status) for (name, status), n in counts.items()), key=lambda r: (r[2], r[0]))
    real_nodes = [n for n in graph["nodes"].values() if not n["type"].startswith("BSW_")]
    return len(real_nodes) - len(report["unsupported"]), rows, report["warnings"]


class BSW_PT_material(bpy.types.Panel):  # noqa: N801 (Blender naming convention)
    bl_label = "Shader Web (three.js)"
    bl_space_type = "PROPERTIES"
    bl_region_type = "WINDOW"
    bl_context = "material"
    bl_options = {"DEFAULT_CLOSED"}

    @classmethod
    def poll(cls, context):
        mat = getattr(context, "material", None)
        return mat is not None and mat.node_tree is not None

    def draw(self, context):
        layout = self.layout
        live, rows, warnings = summarize(context.material)
        for warning in warnings:
            layout.label(text=warning, icon="ERROR")
        if live is None:
            layout.label(text="Nothing to export", icon="INFO")
            return
        if not rows:
            layout.label(text=f"All {live} nodes run live in three.js", icon="CHECKMARK")
            return
        layout.label(text=f"{live} nodes run live. Not live yet:", icon="INFO")
        col = layout.column(align=True)
        for name, count, status in rows:
            text, icon = STATUS_TEXT.get(status, STATUS_TEXT["unknown"])
            suffix = f" ×{count}" if count > 1 else ""
            col.label(text=f"{name}{suffix}: {text}", icon=icon)


classes = (BSW_PT_material,)
