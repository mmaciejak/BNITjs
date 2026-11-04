/*
 * Noise Texture (Blender 4.1+ layout, with the merged Musgrave types). Ported from Cycles'
 * svm_node_tex_noise (intern/cycles/kernel/svm/noisetex.h, Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2022 Blender Foundation. SPDX-License-Identifier: Apache-2.0.
 */
import { clamp, float, max, vec3 } from 'three/tsl';
import type { FloatNode } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { hashFloat2JS, hashFloatJS } from './hash.js';
import { type Dimensions, type FractalType, type P, fractal, join, snoise } from './perlin.js';
import { textureVector } from './textureVector.js';

const DIMS: Record<string, Dimensions> = { '1D': 1, '2D': 2, '3D': 3, '4D': 4 };

const f32 = Math.fround;

/** random_float_offset / random_floatN_offset: a per-seed offset in [100, 200) on each axis. */
function randomOffset(dims: Dimensions, seed: number): P {
  if (dims === 1) return join([float(f32(100 + f32(hashFloatJS(seed) * 100)))]);
  const c = Array.from({ length: dims }, (_, i) =>
    float(f32(100 + f32(hashFloat2JS(seed, i) * 100))),
  );
  return join(c);
}

const add = (p: P, q: P) => p.add(q) as P;

export const noise: NodeImpl = (ctx) => {
  const dims = DIMS[ctx.prop<string>('noise_dimensions', '3D')] ?? 3;
  const type = ctx.prop<FractalType>('noise_type', 'FBM');
  const normalize = ctx.prop<boolean>('normalize', true);

  const scale = ctx.float('Scale', 5);
  const params = {
    detail: clamp(ctx.float('Detail', 2), 0, 15) as FloatNode,
    roughness: max(ctx.float('Roughness', 0.5), 0) as FloatNode,
    lacunarity: ctx.float('Lacunarity', 2),
    offset: ctx.float('Offset', 0),
    gain: ctx.float('Gain', 1),
  };
  const distortion = ctx.float('Distortion', 0);
  const distorted = ctx.isLinked('Distortion') || ctx.inputValue('Distortion') !== 0;

  const w = ctx.float('W').mul(scale);
  const v = dims === 1 ? null : textureVector(ctx).mul(scale);
  let p = join(v ? [v.x, v.y, v.z, w].slice(0, dims) : [w]).toVar() as P;

  // Domain distortion: each axis is displaced by noise at a different random offset.
  if (distorted) {
    const d = Array.from({ length: dims }, (_, i) =>
      snoise(dims, add(p, randomOffset(dims, i))).mul(distortion),
    );
    p = add(p, join(d));
  }

  const value = fractal(type, dims, normalize, p, params);
  if (!ctx.isOutputLinked('Color')) return { Fac: value, Color: vec3(value) };
  // Color: the value plus the same noise at the next two random offsets (seeds dims, dims + 1).
  const color = vec3(
    value,
    fractal(type, dims, normalize, add(p, randomOffset(dims, dims)), params),
    fractal(type, dims, normalize, add(p, randomOffset(dims, dims + 1)), params),
  );
  return { Fac: value, Color: color };
};
