/**
 * Mix Shader and Add Shader on closures. three.js materials cannot layer arbitrary BSDFs, so
 * shaders are combined by their parameters:
 *
 * - Emission and Transparent combine exactly: radiance R and opacity (1 − transparency) mix (or
 *   add) linearly, and the material draws R / opacity with alpha blending, which composites like
 *   Cycles over whatever is behind.
 * - With a BSDF involved, each side is turned into a Principled closure (an emission becomes a
 *   black, non-specular BSDF with that emission; Transparent the same with alpha 0) and every
 *   parameter is mixed. Exact for mixing two Principled BSDFs that differ only in color-like
 *   parameters; an approximation otherwise. Add Shader of two BSDFs sums them (approximation).
 */
import { float, min, mix, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import { shadingNormalBlender } from '../nodes/space.js';
import type { Closure, EmissionClosure, HoldoutClosure, PrincipledClosure } from './closures.js';

const isEmissive = (c: Closure): c is EmissionClosure => c.kind === 'emission';

/**
 * Inside Mix or Add Shader a Holdout can't cut a partial hole: it is treated as Transparent
 * (which shows what is behind instead of cutting it out).
 */
function withoutHoldout(
  c: Closure | null,
  warn?: (message: string) => void,
): Exclude<Closure, HoldoutClosure> | null {
  if (c?.kind !== 'holdout') return c;
  warn?.('a Holdout mixed with other shaders is rendered as Transparent');
  return { kind: 'emission', color: vec3(0), alpha: float(0) };
}

/** Opacity of an emission closure (1 unless it carries transparency). */
const opacity = (c: EmissionClosure): FloatNode => c.alpha ?? float(1);

/** A closure as Principled parameters (emission → black BSDF + emission; alpha → opacity). */
function asPrincipled(c: Exclude<Closure, HoldoutClosure>): PrincipledClosure {
  if (c.kind === 'principled') return c;
  if (c.kind === 'toon') {
    // A toon shader mixed with others: approximated by a diffuse surface of its color.
    return {
      kind: 'principled',
      baseColor: c.color,
      metallic: float(0),
      roughness: float(1),
      alpha: float(1),
      transparent: false,
      emission: vec3(0),
      specular: float(0),
      ...(c.normal ? { normal: c.normal } : {}),
    };
  }
  return {
    kind: 'principled',
    baseColor: vec3(0),
    metallic: float(0),
    roughness: float(1),
    alpha: opacity(c),
    transparent: c.alpha !== undefined,
    emission: c.color,
    specular: float(0),
  };
}

const lerp = <T extends FloatNode | Vec3Node>(a: T, b: T, f: FloatNode) => mix(a, b, f) as T;

function mixPrincipled(
  a: PrincipledClosure,
  b: PrincipledClosure,
  f: FloatNode,
): PrincipledClosure {
  const out: PrincipledClosure = {
    kind: 'principled',
    baseColor: lerp(a.baseColor, b.baseColor, f),
    metallic: lerp(a.metallic, b.metallic, f),
    roughness: lerp(a.roughness, b.roughness, f),
    alpha: lerp(a.alpha, b.alpha, f),
    transparent: a.transparent || b.transparent,
    emission: lerp(a.emission, b.emission, f),
  };
  if (a.specular || b.specular) {
    out.specular = lerp(a.specular ?? float(1), b.specular ?? float(1), f);
  }
  if (a.normal || b.normal) {
    const n = shadingNormalBlender();
    out.normal = lerp(a.normal ?? n, b.normal ?? n, f).normalize() as Vec3Node;
  }
  if (a.coat || b.coat) {
    out.coat = {
      weight: lerp(a.coat?.weight ?? float(0), b.coat?.weight ?? float(0), f),
      roughness: lerp(a.coat?.roughness ?? float(0.03), b.coat?.roughness ?? float(0.03), f),
    };
  }
  if (a.sheen || b.sheen) {
    out.sheen = {
      color: lerp(a.sheen?.color ?? vec3(0), b.sheen?.color ?? vec3(0), f),
      roughness: lerp(a.sheen?.roughness ?? float(0.5), b.sheen?.roughness ?? float(0.5), f),
    };
  }
  if (a.transmission || b.transmission) {
    out.transmission = lerp(a.transmission ?? float(0), b.transmission ?? float(0), f);
  }
  if (a.ior || b.ior) out.ior = lerp(a.ior ?? float(1.5), b.ior ?? float(1.5), f);
  if (a.specularColor || b.specularColor) {
    out.specularColor = lerp(a.specularColor ?? vec3(1), b.specularColor ?? vec3(1), f);
  }
  if (a.thinFilm || b.thinFilm) {
    out.thinFilm = {
      thickness: lerp(a.thinFilm?.thickness ?? float(0), b.thinFilm?.thickness ?? float(0), f),
      ior: lerp(a.thinFilm?.ior ?? float(1.33), b.thinFilm?.ior ?? float(1.33), f),
    };
  }
  if (a.anisotropy || b.anisotropy) {
    out.anisotropy = {
      strength: lerp(a.anisotropy?.strength ?? float(0), b.anisotropy?.strength ?? float(0), f),
      rotation: a.anisotropy?.rotation ?? b.anisotropy?.rotation ?? float(0),
    };
  }
  return out;
}

/** Mix Shader: (1 − fac)·a + fac·b. A missing shader counts as black (no light, opaque). */
export function mixClosures(
  a: Closure | null,
  b: Closure | null,
  fac: FloatNode,
  warn?: (message: string) => void,
): Closure | null {
  const black: EmissionClosure = { kind: 'emission', color: vec3(0) };
  const x = withoutHoldout(a, warn) ?? black;
  const y = withoutHoldout(b, warn) ?? black;
  if (isEmissive(x) && isEmissive(y)) {
    const out: EmissionClosure = { kind: 'emission', color: lerp(x.color, y.color, fac) };
    if (x.alpha || y.alpha) out.alpha = lerp(opacity(x), opacity(y), fac);
    return out;
  }
  return mixPrincipled(asPrincipled(x), asPrincipled(y), fac);
}

/** Add Shader: a + b. Exact for emission and transparency; BSDFs are summed parameter-wise. */
export function addClosures(
  a: Closure | null,
  b: Closure | null,
  warn: (message: string) => void,
): Closure | null {
  if (!a || !b) return a ?? b;
  a = withoutHoldout(a, warn)!;
  b = withoutHoldout(b, warn)!;
  if (isEmissive(a) && isEmissive(b)) {
    const out: EmissionClosure = { kind: 'emission', color: a.color.add(b.color) as Vec3Node };
    if (a.alpha || b.alpha) {
      // Adding transparencies can exceed full transparency; clamp opacity at 0.
      out.alpha = float(1).sub(
        min(
          float(1)
            .sub(opacity(a))
            .add(float(1).sub(opacity(b))),
          1,
        ),
      );
    }
    return out;
  }
  if (isEmissive(a) || isEmissive(b)) {
    const [bsdf, light] = isEmissive(a)
      ? [asPrincipled(b), a]
      : [asPrincipled(a), b as EmissionClosure];
    return { ...bsdf, emission: bsdf.emission.add(light.color) as Vec3Node };
  }
  warn('adding two BSDFs is approximated by summing their parameters');
  const sum = mixPrincipled(asPrincipled(a), asPrincipled(b), float(0.5));
  return {
    ...sum,
    baseColor: sum.baseColor.mul(2) as Vec3Node,
    emission: sum.emission.mul(2) as Vec3Node,
  };
}
