"""Noise Texture parameter sweep: every fractal type in 1D-4D, plus fBm sweeps of detail,
roughness, lacunarity, normalize and distortion.

Unlinked Vector (Generated coordinates), W = 0.37 (1D: W = Generated x · 1.3 − 0.2, so it varies).
FAR / VERY_FAR add a large offset to Generated, to cover Cycles' repeat every 100000 and its
half-cell shift past 1e6. fBm (normalized) shows Color; the other types show Fac × gain + bias, so
their range stays visible.
"""

from _common import by_id, emission_material

TYPES = {
    # type: (offset, gain, display gain, display bias)
    "FBM": (0.0, 1.0, 1.0, 0.0),
    "MULTIFRACTAL": (0.0, 1.0, 0.35, 0.0),
    "RIDGED_MULTIFRACTAL": (1.0, 2.0, 0.4, 0.0),
    "HYBRID_MULTIFRACTAL": (0.7, 1.5, 0.35, 0.0),
    "HETERO_TERRAIN": (0.8, 1.0, 0.3, 0.0),
}
SHORT = {"FBM": "FBM", "MULTIFRACTAL": "MULTI", "RIDGED_MULTIFRACTAL": "RIDGED",
         "HYBRID_MULTIFRACTAL": "HYBRID", "HETERO_TERRAIN": "HETERO"}  # fmt: skip

# variant: (type, dimensions, {input: value}, normalize, output)
SWEEP = {
    "FBM_DETAIL0": ("FBM", "3D", {"Detail": 0.0}, True, "Color"),
    "FBM_DETAIL4": ("FBM", "3D", {"Detail": 4.0}, True, "Color"),
    "FBM_DETAIL15": ("FBM", "3D", {"Detail": 15.0, "Roughness": 0.6}, True, "Fac"),
    "FBM_ROUGH": ("FBM", "3D", {"Detail": 6.3, "Roughness": 0.85, "Scale": 2.5}, True, "Color"),
    "FBM_LACUNARITY": ("FBM", "2D", {"Detail": 3.0, "Lacunarity": 2.7, "Roughness": 0.7}, True, "Fac"),
    "FBM_RAW": ("FBM", "3D", {"Detail": 2.5}, False, "Fac"),
    "FBM_SCALE": ("FBM", "3D", {"Scale": 23.0, "Detail": 1.0}, True, "Fac"),
}
VARIANTS = [f"{SHORT[t]}_{d}" for t in TYPES for d in ("1D", "2D", "3D", "4D")]
VARIANTS += list(SWEEP) + [f"DISTORT_{d}" for d in ("1D", "2D", "3D", "4D")] + ["MULTI_COLOR"]
VARIANTS += ["FAR", "VERY_FAR"]
FAR = {"FAR": (123456.7, -234567.1, 0.0), "VERY_FAR": (1234567.0, -2345678.0, 0.0)}


def spec(variant):
    if variant in SWEEP:
        return SWEEP[variant]
    if variant.startswith("DISTORT_"):
        return ("FBM", variant[-2:], {"Detail": 3.0, "Distortion": 1.3}, True, "Color")
    if variant in FAR:
        return ("FBM", "3D", {"Detail": 2.0, "Scale": 1.0}, True, "Color")
    if variant == "MULTI_COLOR":
        return ("MULTIFRACTAL", "3D", {"Detail": 2.0}, True, "Color")
    short, dims = variant.rsplit("_", 1)
    kind = next(t for t, s in SHORT.items() if s == short)
    return (kind, dims, {"Detail": 3.5}, True, "Color" if kind == "FBM" else "Fac")


def build(variant):
    kind, dims, values, normalize, output = spec(variant)
    offset, gain, show_gain, show_bias = TYPES[kind]
    mat, nodes, links, color_in = emission_material("noise")
    node = nodes.new("ShaderNodeTexNoise")
    node.noise_dimensions = dims
    node.noise_type = kind
    node.normalize = normalize
    inputs = by_id(node.inputs)
    inputs["Offset"].default_value = offset
    inputs["Gain"].default_value = gain
    inputs["W"].default_value = 0.37
    for name, value in values.items():
        inputs[name].default_value = value
    if variant in FAR:
        coord = nodes.new("ShaderNodeTexCoord")
        shift = nodes.new("ShaderNodeVectorMath")
        shift.operation = "ADD"
        shift.inputs[1].default_value = FAR[variant]
        links.new(coord.outputs["Generated"], shift.inputs[0])
        links.new(shift.outputs[0], inputs["Vector"])
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
    out = by_id(node.outputs)[output]
    if not normalize:
        show_gain, show_bias = 0.5, 0.5
    if output == "Fac" and (show_gain, show_bias) != (1.0, 0.0):
        remap = nodes.new("ShaderNodeMath")
        remap.operation = "MULTIPLY_ADD"
        remap.inputs[1].default_value = show_gain
        remap.inputs[2].default_value = show_bias
        links.new(out, remap.inputs[0])
        out = remap.outputs[0]
    elif output == "Color" and show_gain != 1.0:
        remap = nodes.new("ShaderNodeVectorMath")
        remap.operation = "SCALE"
        by_id(remap.inputs)["Scale"].default_value = show_gain
        links.new(out, remap.inputs[0])
        out = remap.outputs[0]
    links.new(out, color_in)
    return mat
