"""Blender Shader Web: export material node graphs for the three.js runtime.

Feature code lands from Phase 1 onward; see SPEC.md.
"""

# Version of the graph export format written into the glTF vendor extension.
GRAPH_FORMAT_VERSION = 1

_classes: tuple = ()


def register():
    import bpy

    for cls in _classes:
        bpy.utils.register_class(cls)


def unregister():
    import bpy

    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)
