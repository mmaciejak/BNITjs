"""Export settings, shown in the glTF exporter's dialog (File > Export > glTF 2.0 > BNITjs).

They are stored on the scene. When the add-on's classes are not registered (the glTF exporter
can find the hooks without that, as the tests do), the defaults below apply.
"""

from dataclasses import dataclass

import bpy


@dataclass
class Settings:
    write_graphs: bool = True
    bake_pbr: bool = False
    bake_unsupported: bool = True
    bake_resolution: int = 1024
    bake_samples: int = 32
    bake_margin: int = 16


class BSW_ExportSettings(bpy.types.PropertyGroup):  # noqa: N801 (Blender naming convention)
    write_graphs: bpy.props.BoolProperty(
        name="Node Graphs",
        description=(
            "Write each material's node graph (EXT_blender_shader_graph) for the BNITjs three.js runtime. "
            "Off: a plain glTF file"
        ),
        default=Settings.write_graphs,
    )
    bake_pbr: bpy.props.BoolProperty(
        name="Bake PBR Fallback",
        description=(
            "Bake each material's base color, alpha, metallic, roughness, normal and emission with Cycles "
            "into the standard glTF material, for viewers without the BNITjs runtime (model-viewer …)"
        ),
        default=Settings.bake_pbr,
    )
    bake_unsupported: bpy.props.BoolProperty(
        name="Bake Unsupported Nodes",
        description=(
            "Bake the outputs of nodes the three.js runtime cannot evaluate live (Ambient Occlusion, "
            "Bevel …) to textures with Cycles, and replace them by Image Textures in the exported graph"
        ),
        default=Settings.bake_unsupported,
    )
    bake_resolution: bpy.props.IntProperty(
        name="Resolution",
        description="Width and height of each baked texture, in pixels",
        default=Settings.bake_resolution,
        min=16,
        max=8192,
    )
    bake_samples: bpy.props.IntProperty(
        name="Samples",
        description="Cycles samples per pixel for baking",
        default=Settings.bake_samples,
        min=1,
        max=4096,
    )
    bake_margin: bpy.props.IntProperty(
        name="Margin",
        description="Pixels the bake is extended past UV island borders",
        default=Settings.bake_margin,
        min=0,
        max=64,
    )


def get(scene=None):
    """The scene's settings, or the defaults when the add-on's properties are not registered."""
    scene = scene if scene is not None else bpy.context.scene
    props = getattr(scene, "bnitjs_export", None)
    if props is None:
        return Settings()
    return Settings(**{name: getattr(props, name) for name in Settings.__dataclass_fields__})


def draw_export(context, layout):
    """Called by the glTF exporter to draw the add-on's settings in its export dialog."""
    props = getattr(context.scene, "bnitjs_export", None)
    if props is None:
        return
    header, body = layout.panel("BNITJS_export", default_closed=False)
    header.label(text="BNITjs (three.js)")
    if body is None:
        return
    body.prop(props, "write_graphs")
    row = body.row()
    row.active = props.write_graphs
    row.prop(props, "bake_unsupported")
    body.prop(props, "bake_pbr")
    col = body.column(align=True)
    col.active = props.bake_pbr or (props.write_graphs and props.bake_unsupported)
    col.prop(props, "bake_resolution")
    col.prop(props, "bake_samples")
    col.prop(props, "bake_margin")


def register():
    bpy.utils.register_class(BSW_ExportSettings)
    bpy.types.Scene.bnitjs_export = bpy.props.PointerProperty(type=BSW_ExportSettings)


def unregister():
    del bpy.types.Scene.bnitjs_export
    bpy.utils.unregister_class(BSW_ExportSettings)
