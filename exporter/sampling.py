"""Sample Color Ramps and curve mappings in Blender, so the runtime can use exact lookup tables.

Evaluating in Blender (``ColorRamp.evaluate``, ``CurveMapping.evaluate``) makes the tables exact by
construction (SPEC §2). The raw stops and points are exported too, so the runtime can evaluate
CONSTANT and LINEAR ramps exactly instead of through the table.
"""

from .values import f32 as _f32

# Cycles' RAMP_TABLE_SIZE: 257 entries at i / 256 (Blender's 256-segment table plus the end
# point). Measured: a CONSTANT ramp element at p switches exactly at ceil(p·256)/256 in Cycles.
LUT_SIZE = 257


def color_ramp(ramp, size=LUT_SIZE):
    lut = []
    for i in range(size):
        lut.extend(_f32(c) for c in ramp.evaluate(i / (size - 1)))
    return {
        "interpolation": ramp.interpolation,
        "colorMode": ramp.color_mode,
        "hueInterpolation": ramp.hue_interpolation,
        "elements": [{"position": _f32(e.position), "color": [_f32(c) for c in e.color]} for e in ramp.elements],
        "size": size,
        "lut": lut,
    }


def _table_range(mapping, curve_count):
    """Cycles' curvemapping_minmax: first/last point x over the curves that build the table."""
    lo = min(mapping.curves[i].points[0].location[0] for i in range(curve_count))
    hi = max(mapping.curves[i].points[-1].location[0] for i in range(curve_count))
    if hi - lo < 1e-6:
        hi = lo + 1.0
    return lo, hi


def curve_mapping(mapping, kind, size=LUT_SIZE):
    """Raw curves plus the lookup table Cycles builds for the node.

    ``kind`` is "RGB" (RGB Curves: entries are R(C(t)), G(C(t)), B(C(t))), "VECTOR" (Vector
    Curves: X(t), Y(t), Z(t)) or "FLOAT" (Float Curve: one value). As in Cycles'
    curvemapping_color_to_array / curvemapping_float_to_array, the table covers ``range``
    (first to last point x over those curves) at t = lo + i·(hi − lo)/(size − 1). The runtime
    looks it up like Cycles' rgb_ramp_lookup, extrapolating linearly from the end entries when
    ``extend == "EXTRAPOLATED"``.
    """
    mapping.initialize()
    curves = mapping.curves
    count = {"RGB": 4, "VECTOR": 3, "FLOAT": 1}[kind]
    lo, hi = _table_range(mapping, count)
    values = []
    for i in range(size):
        x = lo + i / (size - 1) * (hi - lo)
        if kind == "RGB":
            c = mapping.evaluate(curves[3], x)
            entry = [mapping.evaluate(curves[k], c) for k in range(3)]
        elif kind == "VECTOR":
            entry = [mapping.evaluate(curves[k], x) for k in range(3)]
        else:
            entry = [mapping.evaluate(curves[0], x)]
        values.extend(_f32(v) for v in entry)
    out = {
        "extend": mapping.extend,
        "useClip": mapping.use_clip,
        "clip": [
            _f32(mapping.clip_min_x),
            _f32(mapping.clip_min_y),
            _f32(mapping.clip_max_x),
            _f32(mapping.clip_max_y),
        ],
        "curves": [
            {
                "points": [
                    {"location": [_f32(p.location[0]), _f32(p.location[1])], "handle": p.handle_type}
                    for p in curve.points
                ]
            }
            for curve in curves
        ],
        "table": {"kind": kind, "range": [_f32(lo), _f32(hi)], "size": size, "values": values},
    }
    black = [_f32(c) for c in mapping.black_level]
    white = [_f32(c) for c in mapping.white_level]
    if black != [0.0, 0.0, 0.0] or white != [1.0, 1.0, 1.0]:
        out["blackLevel"] = black
        out["whiteLevel"] = white
    if hasattr(mapping, "tone") and mapping.tone != "STANDARD":
        out["tone"] = mapping.tone
    return out
