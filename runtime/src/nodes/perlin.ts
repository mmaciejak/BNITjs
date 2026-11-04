/*
 * Perlin noise and its fractal variants as used by Blender's Noise Texture. Ported from Cycles'
 * intern/cycles/kernel/svm/noise.h and fractal_noise.h (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2022 Blender Foundation. SPDX-License-Identifier: Apache-2.0.
 *
 * snoise and the fractal functions are emitted as shader functions (Fn with a layout), one per
 * dimension and fractal type, and the octave loops are real loops: detail can be a live parameter
 * and unrolling 16 octaves of 4D noise would make huge shaders.
 */
import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  float,
  floor,
  int,
  saturate,
  select,
  step,
  trunc,
  uint,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { hashUint, hashUint2, hashUint3, hashUint4 } from './hash.js';

type F = Node<'float'>;
type U = Node<'uint'>;
/**
 * The noise coordinate: a float, vec2, vec3 or vec4 depending on the dimensions. Typed as vec4
 * because TSL's typings can't do arithmetic on a union; only the shader sees the real type.
 */
export type P = Node<'vec4'>;
export type Dimensions = 1 | 2 | 3 | 4;

const PTYPE = { 1: 'float', 2: 'vec2', 3: 'vec3', 4: 'vec4' } as const;
const AXES = ['x', 'y', 'z', 'w'] as const;

/** The coordinate made of 1-4 float components. */
export function join(parts: F[]): P {
  const [x, y, z, w] = parts as [F, F, F, F];
  switch (parts.length) {
    case 1:
      return x as unknown as P;
    case 2:
      return vec2(x, y) as unknown as P;
    case 3:
      return vec3(x, y, z) as unknown as P;
    default:
      return vec4(x, y, z, w);
  }
}

const fade = (t: F): F =>
  t
    .mul(t)
    .mul(t)
    .mul(t.mul(t.mul(6).sub(15)).add(10)) as F;
const negateIf = (v: F, h: U, bit: number): F =>
  select(h.bitAnd(uint(bit)).notEqual(uint(0)), v.negate(), v) as F;
/** Cycles' mix(a, b, t) = a + t (b - a). */
const mixF = (a: F, b: F, t: F): F => a.add(t.mul(b.sub(a))) as F;
/** The (1 - t) a + t b form of bi_mix / tri_mix. */
const blend = (a: F, b: F, t: F): F => float(1).sub(t).mul(a).add(t.mul(b)) as F;

function grad(dims: Dimensions, hash: U, f: F[]): F {
  const [x, y, z, w] = f as [F, F, F, F];
  switch (dims) {
    case 1: {
      const h = hash.bitAnd(uint(15)) as U;
      const g = float(1).add(h.bitAnd(uint(7)).toFloat()) as F;
      return negateIf(g, h, 8).mul(x) as F;
    }
    case 2: {
      const h = hash.bitAnd(uint(7)) as U;
      const low = h.lessThan(uint(4));
      const u = select(low, x, y) as F;
      const v = select(low, y, x).mul(2) as F;
      return negateIf(u, h, 1).add(negateIf(v, h, 2)) as F;
    }
    case 3: {
      const h = hash.bitAnd(uint(15)) as U;
      const u = select(h.lessThan(uint(8)), x, y) as F;
      const vt = select(h.equal(uint(12)).or(h.equal(uint(14))), x, z) as F;
      const v = select(h.lessThan(uint(4)), y, vt) as F;
      return negateIf(u, h, 1).add(negateIf(v, h, 2)) as F;
    }
    case 4: {
      const h = hash.bitAnd(uint(31)) as U;
      const u = select(h.lessThan(uint(24)), x, y) as F;
      const v = select(h.lessThan(uint(16)), y, z) as F;
      const s = select(h.lessThan(uint(8)), z, w) as F;
      return negateIf(u, h, 1)
        .add(negateIf(v, h, 2))
        .add(negateIf(s, h, 4)) as F;
    }
  }
}

function hashCell(cell: U[]): U {
  switch (cell.length) {
    case 1:
      return hashUint(cell[0]!);
    case 2:
      return hashUint2(cell[0]!, cell[1]!);
    case 3:
      return hashUint3(cell[0]!, cell[1]!, cell[2]!);
    default:
      return hashUint4(cell[0]!, cell[1]!, cell[2]!, cell[3]!);
  }
}

/** perlin_1d .. perlin_4d: gradient noise at p, interpolated over the 2^dims cell corners. */
function perlin(dims: Dimensions, p: P): F {
  const comps = dims === 1 ? [p as unknown as F] : AXES.slice(0, dims).map((a) => p[a] as F);
  const cell: U[] = [];
  const frac: F[] = [];
  for (const c of comps) {
    const fl = floor(c).toVar() as F;
    cell.push(fl.toInt().toUint() as U);
    frac.push(c.sub(fl).toVar() as F);
  }
  const corners: F[] = [];
  for (let corner = 0; corner < 1 << dims; corner++) {
    const k: U[] = [];
    const f: F[] = [];
    for (let axis = 0; axis < dims; axis++) {
      const up = (corner >> axis) & 1;
      k.push(up ? (cell[axis]!.add(uint(1)) as U) : cell[axis]!);
      f.push(up ? (frac[axis]!.sub(1) as F) : frac[axis]!);
    }
    corners.push(grad(dims, hashCell(k), f));
  }
  const t = frac.map(fade);
  if (dims === 1) return mixF(corners[0]!, corners[1]!, t[0]!);
  // bi_mix / tri_mix reduce x, then y, then z; quad_mix mixes the two tri_mix results by w.
  let level = corners;
  for (let axis = 0; axis < Math.min(dims, 3); axis++) {
    const next: F[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(blend(level[i]!, level[i + 1]!, t[axis]!));
    level = next;
  }
  return dims === 4 ? mixF(level[0]!, level[1]!, t[3]!) : level[0]!;
}

const SCALE = { 1: 0.25, 2: 0.6616, 3: 0.982, 4: 0.8344 } as const;

const snoiseFns = new Map<Dimensions, (p: P) => F>();

/**
 * snoise_1d .. snoise_4d: signed Perlin noise. Like Cycles, it repeats every 100000 on each axis
 * (fmod) and shifts by half a cell past 1e6, to avoid float precision problems.
 */
export function snoise(dims: Dimensions, p: P): F {
  let fn = snoiseFns.get(dims);
  if (!fn) {
    fn = Fn(
      ([q]: [P]) => {
        const correction = step(1000000, abs(q)).mul(0.5);
        const repeated = q.sub(trunc(q.div(100000)).mul(100000)).add(correction) as P;
        return perlin(dims, repeated).mul(SCALE[dims]);
      },
      { p: PTYPE[dims], return: 'float' },
    ) as unknown as (p: P) => F;
    snoiseFns.set(dims, fn);
  }
  return fn(p);
}

export type FractalType =
  'FBM' | 'MULTIFRACTAL' | 'HYBRID_MULTIFRACTAL' | 'RIDGED_MULTIFRACTAL' | 'HETERO_TERRAIN';

export interface FractalParams {
  detail: F;
  roughness: F;
  lacunarity: F;
  offset: F;
  gain: F;
}

type FractalFn = (p: P, detail: F, roughness: F, lacunarity: F, offset: F, gain: F) => F;

/** Loop over octaves i = start ..= int(detail). */
const octaves = (start: number, detail: F, body: () => void) =>
  Loop({ start: int(start), end: int(detail), type: 'int', condition: '<=' }, body);

function fractalBody(type: FractalType, dims: Dimensions, normalize: boolean) {
  const sn = (q: P) => snoise(dims, q);
  return ([p, detail, roughness, lacunarity, offset, gain]: [P, F, F, F, F, F]): F => {
    const rmd = detail.sub(floor(detail)).toVar() as F;
    const hasRmd = rmd.notEqual(0);
    switch (type) {
      case 'MULTIFRACTAL': {
        const q = p.toVar() as P;
        const value = float(1).toVar();
        const pwr = float(1).toVar();
        octaves(0, detail, () => {
          value.mulAssign(pwr.mul(sn(q)).add(1));
          pwr.mulAssign(roughness);
          q.mulAssign(lacunarity);
        });
        If(hasRmd, () => {
          value.mulAssign(rmd.mul(pwr).mul(sn(q)).add(1));
        });
        return value as F;
      }
      case 'HETERO_TERRAIN': {
        const q = p.toVar() as P;
        const pwr = roughness.toVar();
        const value = offset.add(sn(q)).toVar();
        q.mulAssign(lacunarity);
        octaves(1, detail, () => {
          const increment = sn(q).add(offset).mul(pwr).mul(value);
          value.addAssign(increment);
          pwr.mulAssign(roughness);
          q.mulAssign(lacunarity);
        });
        If(hasRmd, () => {
          const increment = sn(q).add(offset).mul(pwr).mul(value);
          value.addAssign(rmd.mul(increment));
        });
        return value as F;
      }
      case 'HYBRID_MULTIFRACTAL': {
        const q = p.toVar() as P;
        const pwr = float(1).toVar();
        const value = float(0).toVar();
        const weight = float(1).toVar();
        octaves(0, detail, () => {
          If(weight.lessThanEqual(0.001), () => {
            Break();
          });
          weight.assign(weight.min(1));
          const signal = sn(q).add(offset).mul(pwr).toVar();
          pwr.mulAssign(roughness);
          value.addAssign(weight.mul(signal));
          weight.mulAssign(gain.mul(signal));
          q.mulAssign(lacunarity);
        });
        If(hasRmd.and(weight.greaterThan(0.001)), () => {
          weight.assign(weight.min(1));
          const signal = sn(q).add(offset).mul(pwr);
          value.addAssign(rmd.mul(weight).mul(signal));
        });
        return value as F;
      }
      case 'RIDGED_MULTIFRACTAL': {
        const q = p.toVar() as P;
        const pwr = roughness.toVar();
        const signal = offset.sub(abs(sn(q))).toVar();
        signal.mulAssign(signal);
        const value = signal.toVar();
        octaves(1, detail, () => {
          q.mulAssign(lacunarity);
          const weight = saturate(signal.mul(gain)).toVar();
          signal.assign(offset.sub(abs(sn(q))));
          signal.mulAssign(signal);
          signal.mulAssign(weight);
          value.addAssign(signal.mul(pwr));
          pwr.mulAssign(roughness);
        });
        return value as F;
      }
      default: {
        // fBm
        const fscale = float(1).toVar();
        const amp = float(1).toVar();
        const maxamp = float(0).toVar();
        const sum = float(0).toVar();
        octaves(0, detail, () => {
          const t = sn(p.mul(fscale) as P);
          sum.addAssign(t.mul(amp));
          maxamp.addAssign(amp);
          amp.mulAssign(roughness);
          fscale.mulAssign(lacunarity);
        });
        const result = (normalize ? sum.div(maxamp).mul(0.5).add(0.5) : sum).toVar();
        If(hasRmd, () => {
          const sum2 = sum.add(sn(p.mul(fscale) as P).mul(amp));
          const second = normalize ? sum2.div(maxamp.add(amp)).mul(0.5).add(0.5) : sum2;
          result.assign(mixF(result as F, second as F, rmd));
        });
        return result as F;
      }
    }
  };
}

const fractalFns = new Map<string, FractalFn>();

/** noise_select: the fractal noise of the given type (detail already clamped to [0, 15]). */
export function fractal(
  type: FractalType,
  dims: Dimensions,
  normalize: boolean,
  p: P,
  { detail, roughness, lacunarity, offset, gain }: FractalParams,
): F {
  const key = `${type}/${dims}/${type === 'FBM' && normalize}`;
  let fn = fractalFns.get(key);
  if (!fn) {
    fn = Fn(fractalBody(type, dims, normalize), {
      p: PTYPE[dims],
      detail: 'float',
      roughness: 'float',
      lacunarity: 'float',
      offset: 'float',
      gain: 'float',
      return: 'float',
    }) as unknown as FractalFn;
    fractalFns.set(key, fn);
  }
  return fn(p, detail, roughness, lacunarity, offset, gain);
}
