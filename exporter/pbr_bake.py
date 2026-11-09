"""Bake a material into the standard glTF PBR material, for viewers without the BNITjs runtime
(model-viewer, Babylon.js, game engines …).

The channels come from the exported (flattened) graph's surface shader:

- Principled BSDF: Base Color, Alpha, Metallic, Roughness and Emission Color × Strength. A linked
  input is baked by routing its source into an Emission shader; an unlinked one becomes a factor.
- Emission: black base color, emission Color × Strength.
- Any other shader (Mix Shader, Diffuse, Glass …): Cycles' Diffuse Color, Roughness and Emit passes,
  metallic 0. An approximation.

A tangent-space normal map is baked (Cycles' Normal pass, MikkTSpace) when a Normal input or the
Material Output's Displacement is linked.
"""

import numpy as np

from .bake_fallback import BakeJob, bake_object, run_bakes
from .graph_export import VALUE_NODE


def _link_into(graph, node_id, input_id):
    for link in graph.get("links", []):
        if link["to"] == [node_id, input_id]:
            return link["from"]
    return None


def _source(graph, node_id, input_id, default):
    """("socket", node id, output) feeding an input, or ("value", v) when it is constant."""
    source = _link_into(graph, node_id, input_id)
    if source is None:
        value = graph["nodes"][node_id].get("inputs", {}).get(input_id, {}).get("value", default)
        return ("value", value)
    from_node = graph["nodes"][source[0]]
    if from_node["type"] == VALUE_NODE:
        return ("value", from_node.get("properties", {}).get("value", default))
    return ("socket", source[0], source[1])


def _needs_normal(graph):
    output = graph["nodes"][graph["output"]]
    if _link_into(graph, graph["output"], "Displacement") is not None and "Displacement" in output.get("inputs", {}):
        return True
    return any(link["to"][1] in ("Normal", "Coat Normal") for link in graph.get("links", []))


def channels(graph):
    """How to fill each PBR channel: name → BakeJob, or ("value", v) for a constant."""
    surface = _link_into(graph, graph["output"], "Surface")
    if surface is None:
        return {"base": ("value", [0.0, 0.0, 0.0, 1.0]), "metallic": ("value", 0.0), "roughness": ("value", 1.0)}
    node_id = surface[0]
    node_type = graph["nodes"][node_id]["type"]

    def job(name, color, strength=("value", 1.0)):
        if color[0] == "value" and strength[0] == "value":
            if name == "emission":
                c = color[1] if isinstance(color[1], list) else [color[1]] * 3
                return ("value", [v * strength[1] for v in c[:3]])
            return color
        return BakeJob(key=name, color=color, strength=strength)

    result = {}
    if node_type == "ShaderNodeBsdfPrincipled":
        result["base"] = job("base", _source(graph, node_id, "Base Color", [0.8, 0.8, 0.8, 1.0]))
        result["alpha"] = job("alpha", _source(graph, node_id, "Alpha", 1.0))
        result["metallic"] = job("metallic", _source(graph, node_id, "Metallic", 0.0))
        result["roughness"] = job("roughness", _source(graph, node_id, "Roughness", 0.5))
        result["emission"] = job(
            "emission",
            _source(graph, node_id, "Emission Color", [1.0, 1.0, 1.0, 1.0]),
            _source(graph, node_id, "Emission Strength", 0.0),
        )
    elif node_type == "ShaderNodeEmission":
        result["base"] = ("value", [0.0, 0.0, 0.0, 1.0])
        result["metallic"] = ("value", 0.0)
        result["roughness"] = ("value", 1.0)
        result["emission"] = job(
            "emission", _source(graph, node_id, "Color", [1.0, 1.0, 1.0, 1.0]), _source(graph, node_id, "Strength", 1.0)
        )
    else:
        result["base"] = BakeJob(key="base", kind="DIFFUSE")
        result["metallic"] = ("value", 0.0)
        result["roughness"] = BakeJob(key="roughness", kind="ROUGHNESS")
        result["emission"] = BakeJob(key="emission", kind="EMIT")
    if _needs_normal(graph):
        result["normal"] = BakeJob(key="normal", kind="NORMAL")
    return result


def srgb_encode(linear):
    linear = np.clip(linear, 0.0, 1.0)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


def _plane(channel, baked, size, components):
    """The channel as (size, size, components) floats: baked pixels, or its constant."""
    if isinstance(channel, BakeJob):
        pixels = baked.get(channel.key)
        if pixels is not None:
            return pixels[:, :, :components]
        return None
    value = channel[1]
    value = list(value) if isinstance(value, list | tuple) else [value]
    value = (value * components)[:components] if len(value) == 1 else value[:components]
    return np.broadcast_to(np.asarray(value, dtype=np.float32), (size, size, components))


def _gray(pixels):
    """A baked scalar (Emission of a float is gray) as one channel."""
    return pixels[:, :, :3].mean(axis=2) if pixels.shape[2] >= 3 else pixels[:, :, 0]


def bake_pbr(material, graph, report, scene, settings):
    """Bake ``material``. Returns (result, warnings); result is None when nothing could be baked.

    ``result`` holds 8-bit-ready float images (height × width × 4, bottom row first, values 0–1)
    and factors: ``base`` (sRGB rgb + alpha) or ``baseFactor``, ``metallicRoughness`` (G roughness,
    B metallic) or ``metallicFactor``/``roughnessFactor``, ``normal``, ``emissive`` (sRGB) with
    ``emissiveFactor`` and ``emissiveStrength``, ``blend`` (alpha below 1 somewhere), and ``uvMap``.
    """
    plan = channels(graph)
    jobs = [c for c in plan.values() if isinstance(c, BakeJob)]
    warnings = []
    baked, uv_map = {}, None
    if jobs:
        obj, others = bake_object(material, scene)
        if obj is None:
            return None, [f"Material '{material.name}': no mesh with a UV map uses it, so it cannot be baked to PBR"]
        if others:
            warnings.append(
                f"Material '{material.name}' is baked to PBR on '{obj.name}'; "
                f"{len(others)} other object(s) reuse those textures through their own UV maps"
            )
        baked, uv_map, bake_warnings = run_bakes(material, obj, scene, jobs, report["sources"], settings)
        warnings += [f"Material '{material.name}': {w}" for w in bake_warnings]
    size = settings.bake_resolution
    result = {"uvMap": uv_map}

    base, alpha = plan["base"], plan.get("alpha", ("value", 1.0))
    if isinstance(base, BakeJob) or isinstance(alpha, BakeJob):
        rgb = _plane(base, baked, size, 3)
        a = _plane(alpha, baked, size, 3)
        if rgb is not None and a is not None:
            image = np.ones((size, size, 4), dtype=np.float32)
            image[:, :, :3] = srgb_encode(rgb)
            image[:, :, 3] = np.clip(_gray(a), 0.0, 1.0)
            result["base"] = image
            result["blend"] = bool((image[:, :, 3] < 1.0 - 1e-3).any())
    else:
        color = base[1] if isinstance(base[1], list) else [base[1]] * 3
        result["baseFactor"] = [*color[:3], float(alpha[1])]
        result["blend"] = float(alpha[1]) < 1.0

    metallic, roughness = plan["metallic"], plan["roughness"]
    if isinstance(metallic, BakeJob) or isinstance(roughness, BakeJob):
        m = _plane(metallic, baked, size, 3)
        r = _plane(roughness, baked, size, 3)
        if m is not None and r is not None:
            image = np.ones((size, size, 4), dtype=np.float32)
            image[:, :, 1] = np.clip(_gray(r), 0.0, 1.0)
            image[:, :, 2] = np.clip(_gray(m), 0.0, 1.0)
            result["metallicRoughness"] = image
    else:
        result["metallicFactor"] = float(metallic[1])
        result["roughnessFactor"] = float(roughness[1])

    emission = plan["emission"]
    if isinstance(emission, BakeJob):
        e = _plane(emission, baked, size, 3)
        if e is not None:
            e = np.maximum(e, 0.0)
            peak = float(e.max())
            if peak > 1e-6:
                strength = max(peak, 1.0)
                image = np.ones((size, size, 4), dtype=np.float32)
                image[:, :, :3] = srgb_encode(e / strength)
                result["emissive"] = image
                result["emissiveFactor"] = [1.0, 1.0, 1.0]
                result["emissiveStrength"] = strength
    else:
        color = [max(0.0, float(v)) for v in emission[1][:3]]
        peak = max(color)
        if peak > 1e-6:
            strength = max(peak, 1.0)
            result["emissiveFactor"] = [v / strength for v in color]
            result["emissiveStrength"] = strength

    normal = plan.get("normal")
    if normal is not None and normal.key in baked:
        image = np.ones((size, size, 4), dtype=np.float32)
        image[:, :, :3] = np.clip(baked[normal.key][:, :, :3], 0.0, 1.0)
        result["normal"] = image
    return result, warnings
