/*
 * Legacy Mix node (MixRGB). Follows Cycles' svm_node_mix (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { saturate } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { blend } from './color.js';

/** Legacy Mix (MixRGB): factor clamped to [0, 1]; use_clamp clamps the result. */
export const mixRGB: NodeImpl = (ctx) => {
  const mode = ctx.prop<string>('blend_type', 'MIX');
  const factor = saturate(ctx.float('Fac', 0.5));
  let result = blend(
    mode,
    factor,
    ctx.vec3('Color1', [0.5, 0.5, 0.5]),
    ctx.vec3('Color2', [0.5, 0.5, 0.5]),
  );
  if (!result) {
    ctx.warn(`blend mode ${mode} is not supported; using MIX`);
    result = blend('MIX', factor, ctx.vec3('Color1'), ctx.vec3('Color2'))!;
  }
  if (ctx.prop('use_clamp', false)) result = saturate(result);
  return { Color: result };
};
