"""Export the materials for the performance check (SPEC §6) to parity/compare/out/perf_<case>/.

    blender -b --factory-startup --python parity/perf_cases.py

Each case is the parity plane and camera with a Noise or Voronoi Texture whose Detail comes from a
Value node labelled "$Detail", so the browser side (parity/compare/perf.mjs) can sweep Detail as a live
parameter without rebuilding the shader. "baseline" is a constant emission, for the fixed cost of
a frame.
"""

import os
import sys

import bpy

PARITY = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(PARITY)
sys.path.insert(0, REPO)
sys.path.insert(0, os.path.join(REPO, "exporter", "tests"))
sys.path.insert(0, os.path.join(PARITY, "scenes"))

from _common import by_id, emission_material  # noqa: E402
from test_gltf_export import disable_addon, enable_addon  # noqa: E402

OUT_DIR = os.path.join(PARITY, "compare", "out")

# case: (noise type, dimensions, output, distortion) for Noise; None = baseline
CASES = {
    "baseline": None,
    "fbm_2d_fac": ("FBM", "2D", "Fac", 0.0),
    "fbm_3d_fac": ("FBM", "3D", "Fac", 0.0),
    "fbm_3d_color": ("FBM", "3D", "Color", 0.0),
    "fbm_3d_distorted_color": ("FBM", "3D", "Color", 1.0),
    "fbm_4d_fac": ("FBM", "4D", "Fac", 0.0),
    "fbm_4d_color": ("FBM", "4D", "Color", 0.0),
    "ridged_3d_fac": ("RIDGED_MULTIFRACTAL", "3D", "Fac", 0.0),
}
# case: (feature, dimensions, output) for Voronoi
VORONOI_CASES = {
    "voronoi_f1_2d": ("F1", "2D", "Distance"),
    "voronoi_f1_3d": ("F1", "3D", "Distance"),
    "voronoi_f1_3d_color": ("F1", "3D", "Color"),
    "voronoi_f1_4d": ("F1", "4D", "Distance"),
    "voronoi_f2_3d": ("F2", "3D", "Distance"),
    "voronoi_smooth_f1_3d": ("SMOOTH_F1", "3D", "Distance"),
    "voronoi_smooth_f1_4d": ("SMOOTH_F1", "4D", "Distance"),
    "voronoi_edge_3d": ("DISTANCE_TO_EDGE", "3D", "Distance"),
}


def build_voronoi(case):
    mat, nodes, links, color_in = emission_material(f"perf_{case}")
    feature, dims, output = VORONOI_CASES[case]
    node = nodes.new("ShaderNodeTexVoronoi")
    node.feature = feature
    node.voronoi_dimensions = dims
    detail = nodes.new("ShaderNodeValue")
    detail.label = "$Detail"
    detail.outputs[0].default_value = 2.0
    links.new(detail.outputs[0], by_id(node.inputs)["Detail"])
    links.new(by_id(node.outputs)[output], color_in)
    return mat


def build(case):
    if case in VORONOI_CASES:
        return build_voronoi(case)
    mat, nodes, links, color_in = emission_material(f"perf_{case}")
    spec = CASES[case]
    if spec is None:
        color_in.default_value = (0.5, 0.5, 0.5, 1.0)
        return mat
    kind, dims, output, distortion = spec
    node = nodes.new("ShaderNodeTexNoise")
    node.noise_type = kind
    node.noise_dimensions = dims
    inputs = by_id(node.inputs)
    inputs["Distortion"].default_value = distortion
    inputs["Offset"].default_value = 1.0
    detail = nodes.new("ShaderNodeValue")
    detail.label = "$Detail"
    detail.outputs[0].default_value = 2.0
    links.new(detail.outputs[0], inputs["Detail"])
    links.new(by_id(node.outputs)[output], color_in)
    return mat


def main():
    for case in [*CASES, *VORONOI_CASES]:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        enable_addon()
        bpy.ops.mesh.primitive_plane_add(size=2.0)
        plane = bpy.context.active_object
        plane.data.materials.append(build(case))
        cam_data = bpy.data.cameras.new("Camera")
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = 2.0
        camera = bpy.data.objects.new("Camera", cam_data)
        camera.location = (0.0, 0.0, 2.0)
        bpy.context.scene.collection.objects.link(camera)
        out = os.path.join(OUT_DIR, f"perf_{case}")
        os.makedirs(out, exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(out, "scene.gltf"), export_format="GLTF_SEPARATE", export_cameras=True
        )
        disable_addon()
        print(f"perf: exported {case}")


main()
