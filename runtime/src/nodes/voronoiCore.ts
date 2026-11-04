/*
 * Voronoi features. Ported from Blender's gpu_shader_material_voronoi.glsl (Blender 5.2 and 4.2),
 * which matches Cycles' kernel/svm/voronoi.h.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 *
 * Blender 5 hashes the integer cell coordinates with PCG (hash_int*_to_vec*); Blender 4.x hashes
 * the float cell coordinates with lookup3 (hash_vec*_to_vec*). The two give different patterns, so
 * the exporting Blender version picks the variant (`legacy` = 4.x). 1D uses float hashing in both.
 *
 * Each feature is a shader function (Fn with a layout) per dimensions / metric / hash variant,
 * with real loops over the neighbouring cells. It returns
 * mat3(vec3(distance, position.w, 0), color, position.xyz).
 */
import {
  Fn,
  If,
  Loop,
  abs,
  distance as dist,
  dot,
  float,
  floor,
  int,
  ivec2,
  ivec3,
  ivec4,
  mat3,
  max,
  min,
  mix,
  normalize,
  pow,
  select,
  smoothstep,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import {
  hashFloat,
  hashFloat2ToVec3,
  hashFloat3ToVec3,
  hashFloat4ToVec3,
  hashFloatToVec3,
  hashInt2ToVec2,
  hashInt2ToVec3,
  hashInt3ToVec3,
  hashInt4ToVec3,
  hashInt4ToVec4,
  hashVec2ToVec2,
  hashVec4ToVec4,
} from './hash.js';
import type { Dimensions } from './perlin.js';

type F = Node<'float'>;
type V3 = Node<'vec3'>;
/** A float or vec2-vec4 coordinate, typed as vec4 (see perlin.ts). */
type P = Node<'vec4'>;
/** An int or ivec2-ivec4 cell index, typed as ivec4. */
type IP = Node<'ivec4'>;

export type Metric = 'EUCLIDEAN' | 'MANHATTAN' | 'CHEBYCHEV' | 'MINKOWSKI';
export type Feature = 'F1' | 'F2' | 'SMOOTH_F1' | 'DISTANCE_TO_EDGE' | 'N_SPHERE_RADIUS';

export interface VoronoiVariant {
  dims: Dimensions;
  metric: Metric;
  /** Blender 4.x float cell hashing. */
  legacy: boolean;
}

const PTYPE = { 1: 'float', 2: 'vec2', 3: 'vec3', 4: 'vec4' } as const;
const AXES = ['x', 'y', 'z', 'w'] as const;

const comps = (p: P, dims: Dimensions): F[] =>
  dims === 1 ? [p as unknown as F] : AXES.slice(0, dims).map((a) => p[a] as F);

/** vecN from N float components (float for N = 1). */
function vecN(parts: F[]): P {
  const [x, y, z, w] = parts as [F, F, F, F];
  if (parts.length === 1) return x as unknown as P;
  if (parts.length === 2) return vec2(x, y) as unknown as P;
  if (parts.length === 3) return vec3(x, y, z) as unknown as P;
  return vec4(x, y, z, w);
}

/** ivecN from a float vector of integral values. */
function ivecN(p: P, dims: Dimensions): IP {
  if (dims === 2) return ivec2(p as unknown as Node<'vec2'>) as unknown as IP;
  if (dims === 3) return ivec3(p as unknown as V3) as unknown as IP;
  return ivec4(p);
}

/** voronoi_distance for the variant's metric (1D: |a - b|). */
export function metricDistance(v: VoronoiVariant, a: P, b: P, exponent: F): F {
  if (v.dims === 1) return abs(a.sub(b)) as unknown as F;
  const d = comps(a, v.dims).map((c, i) => abs(c.sub(comps(b, v.dims)[i]!)) as F);
  switch (v.metric) {
    case 'MANHATTAN':
      return d.reduce((s, c) => s.add(c) as F);
    case 'CHEBYCHEV':
      return d.reduceRight((m, c) => max(c, m) as F);
    case 'MINKOWSKI':
      return pow(
        d.map((c) => pow(c, exponent) as F).reduce((s, c) => s.add(c) as F),
        float(1).div(exponent),
      ) as F;
    default:
      return dist(a, b) as F;
  }
}

/** The jittered point offset of a cell: hash(cell + offset) (a float vector of `dims`). */
function cellHash(v: VoronoiVariant, cellF: P, cellI: IP, offset: P): P {
  if (v.dims === 1) return hashFloat(cellF.add(offset) as unknown as F) as unknown as P;
  if (v.legacy) {
    const k = cellF.add(offset) as P;
    if (v.dims === 2) return hashVec2ToVec2(k as unknown as Node<'vec2'>) as unknown as P;
    if (v.dims === 3) return hashFloat3ToVec3(k as unknown as V3) as unknown as P;
    return hashVec4ToVec4(k);
  }
  const k = cellI.add(ivecN(offset, v.dims)) as IP;
  if (v.dims === 2) return hashInt2ToVec2(k as unknown as Node<'ivec2'>) as unknown as P;
  if (v.dims === 3) return hashInt3ToVec3(k as unknown as Node<'ivec3'>) as unknown as P;
  return hashInt4ToVec4(k);
}

/** The color of a cell: hash_*_to_vec3(cell + offset). */
function cellColor(v: VoronoiVariant, cellF: P, cellI: IP, offset: P): V3 {
  if (v.dims === 1 || v.legacy) {
    const k = cellF.add(offset) as P;
    if (v.dims === 1) return hashFloatToVec3(k as unknown as F);
    if (v.dims === 2) return hashFloat2ToVec3(k as unknown as Node<'vec2'>);
    if (v.dims === 3) return hashFloat3ToVec3(k as unknown as V3);
    return hashFloat4ToVec3(k);
  }
  const k = cellI.add(ivecN(offset, v.dims)) as IP;
  if (v.dims === 2) return hashInt2ToVec3(k as unknown as Node<'ivec2'>);
  if (v.dims === 3) return hashInt3ToVec3(k as unknown as Node<'ivec3'>);
  return hashInt4ToVec3(k);
}

/** voronoi_position: 1D goes to w, 2D-3D pad with 0. */
function toPosition4(p: P, dims: Dimensions): Node<'vec4'> {
  const c = comps(p, dims);
  if (dims === 1) return vec4(0, 0, 0, c[0]!);
  return vec4(c[0]!, c[1]!, c[2] ?? 0, c[3] ?? 0);
}

/**
 * Loop over the cell offsets in [-r, r]^dims, in Blender's order (x innermost), calling body
 * with the offset as a float vector.
 */
function forCells(dims: Dimensions, r: number, body: (offset: P) => void) {
  const range = { start: int(-r), end: int(r), type: 'int', condition: '<=' } as const;
  const ranges = Array.from({ length: dims }, () => range);
  const loop = Loop as unknown as (...args: unknown[]) => void;
  loop(...ranges, (vars: Record<string, Node<'int'>>) => {
    // Loop names its variables i, j, k, l from the outermost: the outermost is the last axis.
    const names = ['i', 'j', 'k', 'l'].slice(0, dims).reverse();
    body(vecN(names.map((n) => vars[n]!.toFloat() as F)));
  });
}

interface Cell {
  cellF: P;
  local: P;
  cellI: IP;
}

function setup(v: VoronoiVariant, coord: P): Cell {
  const cellF = floor(coord).toVar() as P;
  const local = coord.sub(cellF).toVar() as P;
  const cellI = (v.dims === 1 ? int(0) : ivecN(cellF, v.dims).toVar()) as IP;
  return { cellF, local, cellI };
}

const pack = (distance: F, color: V3, position: P, dims: Dimensions) => {
  const p4 = toPosition4(position, dims);
  return mat3(vec3(distance, p4.w, 0), color, p4.xyz);
};

/** voronoi_f1. */
const FLT_MAX = 3.4028234663852886e38;
const zeroVar = (dims: Dimensions) =>
  vecN(Array.from({ length: dims }, () => float(0))).toVar() as P;

type Body = (args: [P, F, F, F]) => Node<'mat3'>;

function f1(v: VoronoiVariant): Body {
  return ([coord, randomness, exponent]) => {
    const { cellF, local, cellI } = setup(v, coord);
    const minDistance = float(FLT_MAX).toVar();
    const targetOffset = zeroVar(v.dims);
    const targetPosition = zeroVar(v.dims);
    forCells(v.dims, 1, (offset) => {
      const point = offset.add(cellHash(v, cellF, cellI, offset).mul(randomness)).toVar() as P;
      const d = metricDistance(v, point, local, exponent).toVar();
      If(d.lessThan(minDistance), () => {
        targetOffset.assign(offset);
        minDistance.assign(d);
        targetPosition.assign(point);
      });
    });
    const color = cellColor(v, cellF, cellI, targetOffset);
    return pack(minDistance as F, color, targetPosition.add(cellF) as P, v.dims);
  };
}

/** voronoi_f2: the second closest point. */
function f2(v: VoronoiVariant): Body {
  return ([coord, randomness, exponent]) => {
    const { cellF, local, cellI } = setup(v, coord);
    const distanceF1 = float(FLT_MAX).toVar();
    const distanceF2 = float(FLT_MAX).toVar();
    const offsetF1 = zeroVar(v.dims);
    const positionF1 = zeroVar(v.dims);
    const offsetF2 = zeroVar(v.dims);
    const positionF2 = zeroVar(v.dims);
    forCells(v.dims, 1, (offset) => {
      const point = offset.add(cellHash(v, cellF, cellI, offset).mul(randomness)).toVar() as P;
      const d = metricDistance(v, point, local, exponent).toVar();
      If(d.lessThan(distanceF1), () => {
        distanceF2.assign(distanceF1);
        distanceF1.assign(d);
        offsetF2.assign(offsetF1);
        offsetF1.assign(offset);
        positionF2.assign(positionF1);
        positionF1.assign(point);
      }).ElseIf(d.lessThan(distanceF2), () => {
        distanceF2.assign(d);
        offsetF2.assign(offset);
        positionF2.assign(point);
      });
    });
    const color = cellColor(v, cellF, cellI, offsetF2);
    return pack(distanceF2 as F, color, positionF2.add(cellF) as P, v.dims);
  };
}

/**
 * voronoi_smooth_f1 over the 5^dims neighbourhood. Smoothness is already halved and clamped;
 * with Smoothness 0, Blender uses plain F1.
 */
function smoothF1(v: VoronoiVariant): Body {
  return ([coord, randomness, exponent, smoothness]) => {
    const result = mat3().toVar();
    If(smoothness.equal(0), () => {
      result.assign(voronoiFeature('F1', v)!(coord, randomness, exponent, smoothness));
    }).Else(() => {
      const { cellF, local, cellI } = setup(v, coord);
      const smoothDistance = float(0).toVar();
      const smoothColor = vec3(0).toVar();
      const smoothPosition = zeroVar(v.dims);
      const h = float(-1).toVar();
      forCells(v.dims, 2, (offset) => {
        const point = offset.add(cellHash(v, cellF, cellI, offset).mul(randomness)).toVar() as P;
        const d = metricDistance(v, point, local, exponent).toVar();
        h.assign(
          select(
            h.equal(-1),
            float(1),
            smoothstep(0, 1, float(0.5).add(smoothDistance.sub(d).mul(0.5).div(smoothness))),
          ),
        );
        const correction = smoothness.mul(h).mul(float(1).sub(h)).toVar();
        smoothDistance.assign(mix(smoothDistance, d, h).sub(correction));
        correction.assign(correction.div(float(1).add(smoothness.mul(3))));
        const cellCol = cellColor(v, cellF, cellI, offset);
        smoothColor.assign(mix(smoothColor, cellCol, h).sub(correction));
        smoothPosition.assign(mix(smoothPosition, point, h).sub(correction));
      });
      result.assign(
        pack(smoothDistance as F, smoothColor as V3, cellF.add(smoothPosition) as P, v.dims),
      );
    });
    return result as unknown as Node<'mat3'>;
  };
}

/** voronoi_distance_to_edge: distance to the nearest cell border (Color and Position are 0). */
function distanceToEdge(v: VoronoiVariant): Body {
  return ([coord, randomness]) => {
    const { cellF, local, cellI } = setup(v, coord);
    const zero = vecN(Array.from({ length: v.dims }, () => float(0)));
    if (v.dims === 1) {
      const c = cellF as unknown as F;
      const l = local as unknown as F;
      const mid = hashFloat(c).mul(randomness);
      const left = float(-1).add(hashFloat(c.sub(1)).mul(randomness));
      const right = float(1).add(hashFloat(c.add(1)).mul(randomness));
      const toLeft = abs(mid.add(left).div(2).sub(l));
      const toRight = abs(mid.add(right).div(2).sub(l));
      return pack(min(toLeft, toRight) as F, vec3(0), zero, v.dims);
    }
    const toPoint = (offset: P) =>
      offset
        .add(cellHash(v, cellF, cellI, offset).mul(randomness))
        .sub(local)
        .toVar() as P;
    const vectorToClosest = zeroVar(v.dims);
    const minDistance = float(FLT_MAX).toVar();
    forCells(v.dims, 1, (offset) => {
      const vectorToPoint = toPoint(offset);
      const d = dot(vectorToPoint, vectorToPoint).toVar();
      If(d.lessThan(minDistance), () => {
        minDistance.assign(d);
        vectorToClosest.assign(vectorToPoint);
      });
    });
    minDistance.assign(FLT_MAX);
    forCells(v.dims, 1, (offset) => {
      const vectorToPoint = toPoint(offset);
      const perpendicular = vectorToPoint.sub(vectorToClosest).toVar() as P;
      If(dot(perpendicular, perpendicular).greaterThan(0.0001), () => {
        const toEdge = dot(vectorToClosest.add(vectorToPoint).div(2), normalize(perpendicular));
        minDistance.assign(min(minDistance, toEdge));
      });
    });
    return pack(minDistance as F, vec3(0), zero, v.dims);
  };
}

/**
 * voronoi_n_sphere_radius: half the distance from the closest point to its own closest point
 * (always Euclidean). Returned in the distance slot.
 */
function nSphereRadius(v: VoronoiVariant): Body {
  return ([coord, randomness]) => {
    const { cellF, local, cellI } = setup(v, coord);
    const euclid = (a: P, b: P) => (v.dims === 1 ? abs(a.sub(b)) : dist(a, b)) as unknown as F;
    const pointAt = (offset: P) =>
      offset.add(cellHash(v, cellF, cellI, offset).mul(randomness)).toVar() as P;
    const closestPoint = zeroVar(v.dims);
    const closestPointOffset = zeroVar(v.dims);
    const minDistance = float(FLT_MAX).toVar();
    forCells(v.dims, 1, (offset) => {
      const point = pointAt(offset);
      const d = euclid(point, local).toVar();
      If(d.lessThan(minDistance), () => {
        minDistance.assign(d);
        closestPoint.assign(point);
        closestPointOffset.assign(offset);
      });
    });
    minDistance.assign(FLT_MAX);
    const closestToClosest = zeroVar(v.dims);
    forCells(v.dims, 1, (offset) => {
      const isCenter = v.dims === 1 ? offset.equal(0) : dot(offset, offset).equal(0);
      If(isCenter.not(), () => {
        const point = pointAt(offset.add(closestPointOffset) as P);
        const d = euclid(closestPoint, point).toVar();
        If(d.lessThan(minDistance), () => {
          minDistance.assign(d);
          closestToClosest.assign(point);
        });
      });
    });
    const radius = euclid(closestToClosest, closestPoint).div(2) as F;
    return pack(radius, vec3(0), vecN(Array.from({ length: v.dims }, () => float(0))), v.dims);
  };
}

type FeatureFn = (coord: P, randomness: F, exponent: F, smoothness: F) => Node<'mat3'>;

const BODIES: Partial<Record<Feature, (v: VoronoiVariant) => Body>> = {
  F1: f1,
  F2: f2,
  SMOOTH_F1: smoothF1,
  DISTANCE_TO_EDGE: distanceToEdge,
  N_SPHERE_RADIUS: nSphereRadius,
};

const cache = new Map<string, FeatureFn>();

/** The shader function of a feature: (coord, randomness, exponent, smoothness) -> mat3. */
export function voronoiFeature(feature: Feature, v: VoronoiVariant): FeatureFn | undefined {
  const body = BODIES[feature];
  if (!body) return undefined;
  const key = `${feature}/${v.dims}/${v.metric}/${v.legacy}`;
  let fn = cache.get(key);
  if (!fn) {
    const b = body(v);
    fn = Fn((args: [P, F, F, F]) => b(args), {
      coord: PTYPE[v.dims],
      randomness: 'float',
      exponent: 'float',
      smoothness: 'float',
      return: 'mat3',
    }) as unknown as FeatureFn;
    cache.set(key, fn);
  }
  return fn;
}

export { vecN, comps };
