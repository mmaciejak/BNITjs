"""Measure Cycles' Blackbody and Wavelength nodes into lookup tables for the runtime.

    blender -b --factory-startup --python tools/measure_spectra.py

Blender computes both colors from tables in its C++ code, out of reach of Python, so this renders
them: a strip whose pixel i shows the node at input lo + i·(hi − lo)/(N − 1), saved as float EXR
(scene-linear Rec.709). Writes runtime/src/nodes/spectra.ts. Also prints the colors just outside
the range, to check how the runtime should extend the tables.
"""

import os
import tempfile

import bpy
import numpy as np

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "runtime", "src", "nodes", "spectra.ts")
TABLES = {
    # name: (node type, input, lo, hi, samples)
    "BLACKBODY": ("ShaderNodeBlackbody", "Temperature", 800.0, 12000.0, 1121),
    "WAVELENGTH": ("ShaderNodeWavelength", "Wavelength", 380.0, 780.0, 1601),
}


def render_strip(node_type, socket, values):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    mat = bpy.data.materials.new("m")
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    node = nodes.new(node_type)
    # Pixel column i (of n) shows values[0] + i·step: floor(Generated.x · n) is exactly i there.
    n = len(values)
    step = float(values[1] - values[0]) if n > 1 else 0.0
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    scale = nodes.new("ShaderNodeMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = n
    index = nodes.new("ShaderNodeMath")
    index.operation = "FLOOR"
    value = nodes.new("ShaderNodeMath")
    value.operation = "MULTIPLY_ADD"
    value.inputs[1].default_value = step
    value.inputs[2].default_value = float(values[0])
    links.new(coord.outputs["Generated"], sep.inputs[0])
    links.new(sep.outputs["X"], scale.inputs[0])
    links.new(scale.outputs[0], index.inputs[0])
    links.new(index.outputs[0], value.inputs[0])
    links.new(value.outputs[0], node.inputs[socket])
    links.new(node.outputs[0], emission.inputs["Color"])
    links.new(emission.outputs[0], out.inputs["Surface"])
    bpy.ops.mesh.primitive_plane_add(size=2.0)
    bpy.context.active_object.data.materials.append(mat)
    cam_data = bpy.data.cameras.new("c")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.0
    cam = bpy.data.objects.new("c", cam_data)
    cam.location = (0, 0, 2)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False  # the denoiser would blur neighbouring columns together
    scene.cycles.pixel_filter_type = "BOX"
    scene.cycles.filter_width = 0.01
    scene.render.resolution_x, scene.render.resolution_y = len(values), 4
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    # Orthographic 2×2 view of a 2×2 plane: an N×4 image squeezes it; columns still map to u.
    cam_data.sensor_fit = "HORIZONTAL"
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "strip.exr")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        result = bpy.data.images.load(path)
        got = np.empty(len(values) * 4 * 4, np.float32)
        result.pixels.foreach_get(got)
    return got.reshape(4, len(values), 4)[1, :, :3]


def main():
    lines = [
        "/**",
        " * Blackbody and Wavelength colors measured from Cycles by tools/measure_spectra.py (Blender",
        f" * {bpy.app.version_string}): scene-linear Rec.709 samples over the input range, end points",
        " * included, and the colors below (LOW) and above (HIGH) it. Regenerate with that script; do not",
        " * edit.",
        " */",
    ]
    for name, (node_type, socket, lo, hi, n) in TABLES.items():
        values = np.linspace(lo, hi, n, dtype=np.float32)
        rgb = render_strip(node_type, socket, values)
        low = render_strip(node_type, socket, np.full(8, lo - 100, np.float32))[0]
        high = render_strip(node_type, socket, np.full(8, hi + 100, np.float32))[0]
        flat = ", ".join(f"{v:.6g}" for v in rgb.ravel())
        lines.append(f"export const {name}_RANGE = [{lo}, {hi}] as const;")
        lines.append(f"export const {name}_LOW = [{', '.join(f'{v:.6g}' for v in low)}] as const;")
        lines.append(f"export const {name}_HIGH = [{', '.join(f'{v:.6g}' for v in high)}] as const;")
        lines.append(f"export const {name} = new Float32Array([{flat}]);")
        print("SPECTRA", name, n, low.tolist(), high.tolist())
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("SPECTRA wrote", OUT)


main()
