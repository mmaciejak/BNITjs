"""BNITjs: export material node graphs for the three.js runtime.

With the add-on enabled, every glTF export (File > Export > glTF 2.0) also writes each
material's node graph into the EXT_blender_shader_graph extension. See SPEC.md.
"""

# Discovered by Blender's glTF exporter on every enabled add-on.
from .gltf_hooks import glTF2ExportUserExtension  # noqa: F401
from .graph_export import GRAPH_FORMAT_VERSION  # noqa: F401


def register():
    import bpy

    from . import ui

    for cls in ui.classes:
        bpy.utils.register_class(cls)


def unregister():
    import bpy

    from . import ui

    for cls in reversed(ui.classes):
        bpy.utils.unregister_class(cls)
