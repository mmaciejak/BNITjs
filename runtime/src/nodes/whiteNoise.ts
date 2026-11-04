/*
 * White Noise Texture. Ported from Cycles' svm_node_tex_white_noise
 * (intern/cycles/kernel/svm/white_noise.h, Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2022 Blender Foundation. SPDX-License-Identifier: Apache-2.0.
 *
 * The output is a hash of the input's exact float bits, so it only matches Blender where the
 * input does too (e.g. snapped coordinates); any tiny difference gives a different random value.
 */
import { vec2, vec4 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import {
  hashFloat,
  hashFloat2,
  hashFloat2ToVec3,
  hashFloat3,
  hashFloat3ToVec3,
  hashFloat4,
  hashFloat4ToVec3,
  hashFloatToVec3,
} from './hash.js';

export const whiteNoise: NodeImpl = (ctx) => {
  const dims = ctx.prop<string>('noise_dimensions', '3D');
  const v = ctx.vec3('Vector');
  const w = ctx.float('W');
  switch (dims) {
    case '1D':
      return { Value: hashFloat(w), Color: hashFloatToVec3(w) };
    case '2D': {
      const p = vec2(v.x, v.y);
      return { Value: hashFloat2(p), Color: hashFloat2ToVec3(p) };
    }
    case '4D': {
      const p = vec4(v, w);
      return { Value: hashFloat4(p), Color: hashFloat4ToVec3(p) };
    }
    default:
      return { Value: hashFloat3(v), Color: hashFloat3ToVec3(v) };
  }
};
