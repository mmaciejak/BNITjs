/**
 * Invert Color. Follows Cycles' svm_invert (Blender 5.2): mix(color, 1 − color, fac).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors.
 */
import { mix, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

export const invertColor: NodeImpl = (ctx) => {
  const color = ctx.vec3('Color');
  return { Color: mix(color, vec3(1).sub(color), ctx.float('Fac', 1)) };
};
