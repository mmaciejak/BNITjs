/**
 * Gamma. Follows Cycles' svm_gamma (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors.
 */
import { pow, select, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

export const gamma: NodeImpl = (ctx) => {
  const c = ctx.vec3('Color', [1, 1, 1]);
  const g = ctx.float('Gamma', 1);
  const one = (v: typeof c.x) => select(v.greaterThan(0), pow(v, g), v);
  return { Color: vec3(one(c.x), one(c.y), one(c.z)) };
};
