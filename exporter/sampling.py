"""Sample Color Ramps and curve mappings in Blender, so the runtime can use exact lookup tables.

Evaluating in Blender (``ColorRamp.evaluate``, ``CurveMapping.evaluate``) makes the tables exact by
construction (SPEC §2). The raw stops and points are exported too, so the runtime can evaluate
CONSTANT and LINEAR ramps exactly instead of through the table.
"""

from .values import f32 as _f32

LUT_SIZE = 256


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


def _curve_range(mapping, curve):
    xs = [p.location[0] for p in curve.points]
    lo, hi = min(xs), max(xs)
    if mapping.use_clip:
        lo, hi = min(lo, mapping.clip_min_x), max(hi, mapping.clip_max_x)
    else:
        lo, hi = min(lo, 0.0), max(hi, 1.0)
    if hi - lo < 1e-6:
        hi = lo + 1.0
    return lo, hi


def curve_mapping(mapping, size=LUT_SIZE):
    """Sample every curve of a CurveMapping over its x range.

    Outside ``range`` the runtime extends each curve linearly with ``slopes`` (start, end). The
    slopes are measured numerically, so they are 0 for ``extend == 'HORIZONTAL'``.
    """
    mapping.initialize()
    curves = []
    for curve in mapping.curves:
        lo, hi = _curve_range(mapping, curve)
        step = (hi - lo) / (size - 1)
        lut = [_f32(mapping.evaluate(curve, lo + i * step)) for i in range(size)]
        d = 1.0
        slope_start = (mapping.evaluate(curve, lo) - mapping.evaluate(curve, lo - d)) / d
        slope_end = (mapping.evaluate(curve, hi + d) - mapping.evaluate(curve, hi)) / d
        curves.append(
            {
                "points": [
                    {"location": [_f32(p.location[0]), _f32(p.location[1])], "handle": p.handle_type}
                    for p in curve.points
                ],
                "range": [_f32(lo), _f32(hi)],
                "slopes": [_f32(slope_start), _f32(slope_end)],
                "lut": lut,
            }
        )
    out = {
        "extend": mapping.extend,
        "useClip": mapping.use_clip,
        "clip": [
            _f32(mapping.clip_min_x),
            _f32(mapping.clip_min_y),
            _f32(mapping.clip_max_x),
            _f32(mapping.clip_max_y),
        ],
        "size": size,
        "curves": curves,
    }
    black = [_f32(c) for c in mapping.black_level]
    white = [_f32(c) for c in mapping.white_level]
    if black != [0.0, 0.0, 0.0] or white != [1.0, 1.0, 1.0]:
        out["blackLevel"] = black
        out["whiteLevel"] = white
    if hasattr(mapping, "tone") and mapping.tone != "STANDARD":
        out["tone"] = mapping.tone
    return out
