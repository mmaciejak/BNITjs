"""Voronoi Texture scene builder shared by voronoi.py (Blender 5) and voronoi_legacy.py (4.x).

A variant is "<FEATURE>_<DIMS>[_<METRIC>][_<OUTPUT>][_<OPTION>...]", e.g. F1_3D_COLOR or
F2_2D_MANHATTAN_NORMALIZE. Unlinked Vector (Generated), Scale 5, W = 0.37 (1D: W varies with x).
Options: NORMALIZE, RAND05 (Randomness 0.5), DETAIL (Detail 2.5, Roughness 0.6, Lacunarity 2.2),
SHARP (Smoothness 0: Smooth F1 falls back to F1), SOFT (Smoothness 0.4; default 1).
"""

from _common import by_id, emission_material

FEATURES = ["F1", "F2", "SMOOTH_F1", "DISTANCE_TO_EDGE", "N_SPHERE_RADIUS"]
METRICS = ["EUCLIDEAN", "MANHATTAN", "CHEBYCHEV", "MINKOWSKI"]
OUTPUTS = {"DISTANCE": "Distance", "COLOR": "Color", "POSITION": "Position", "W": "W", "RADIUS": "Radius"}


def parse(variant):
    feature = next(f for f in sorted(FEATURES, key=len, reverse=True) if variant.startswith(f + "_"))
    parts = variant[len(feature) + 1 :].split("_")
    dims, rest = parts[0], parts[1:]
    metric = next((p for p in rest if p in METRICS), "EUCLIDEAN")
    output = next((OUTPUTS[p] for p in rest if p in OUTPUTS), None)
    if output is None:
        output = "Radius" if feature == "N_SPHERE_RADIUS" else "Distance"
    return feature, dims, metric, output, set(rest)


def build(variant):
    feature, dims, metric, output, options = parse(variant)
    mat, nodes, links, color_in = emission_material("voronoi")
    node = nodes.new("ShaderNodeTexVoronoi")
    node.voronoi_dimensions = dims
    node.feature = feature
    node.distance = metric
    node.normalize = "NORMALIZE" in options
    inputs = by_id(node.inputs)
    inputs["W"].default_value = 0.37
    inputs["Exponent"].default_value = 1.5
    if "RAND05" in options:
        inputs["Randomness"].default_value = 0.5
    if "SHARP" in options:
        inputs["Smoothness"].default_value = 0.0
    if "SOFT" in options:
        inputs["Smoothness"].default_value = 0.4
    if "DETAIL" in options:
        inputs["Detail"].default_value = 2.5
        inputs["Roughness"].default_value = 0.6
        inputs["Lacunarity"].default_value = 2.2
    if dims == "1D":
        coord = nodes.new("ShaderNodeTexCoord")
        sep = nodes.new("ShaderNodeSeparateXYZ")
        w = nodes.new("ShaderNodeMath")
        w.operation = "MULTIPLY_ADD"
        w.inputs[1].default_value = 1.3
        w.inputs[2].default_value = -0.2
        links.new(coord.outputs["Generated"], sep.inputs["Vector"])
        links.new(sep.outputs["X"], w.inputs[0])
        links.new(w.outputs[0], inputs["W"])
    links.new(by_id(node.outputs)[output], color_in)
    return mat
