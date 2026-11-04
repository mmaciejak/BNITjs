/*
 * Mix (Blender 3.4+) and the legacy MixRGB node.
 * Follows Cycles' svm_node_mix_float / _vector / _vector_non_uniform / _color and the legacy
 * svm_node_mix (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { float, mix as lerp, saturate, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { blend } from './color.js';

export const mix: NodeImpl = (ctx) => {
  const dataType = ctx.prop<string>('data_type', 'FLOAT');
  const clampFactor = ctx.prop('clamp_factor', true);
  const factor = clampFactor
    ? saturate(ctx.float('Factor_Float', 0.5))
    : ctx.float('Factor_Float', 0.5);
  const zero = {
    Result_Float: float(0),
    Result_Vector: vec3(0),
    Result_Color: vec3(0),
    Result_Rotation: vec3(0),
  };

  if (dataType === 'FLOAT') {
    return { ...zero, Result_Float: lerp(ctx.float('A_Float'), ctx.float('B_Float'), factor) };
  }
  if (dataType === 'VECTOR') {
    const a = ctx.vec3('A_Vector');
    const b = ctx.vec3('B_Vector');
    if (ctx.prop<string>('factor_mode', 'UNIFORM') === 'NON_UNIFORM') {
      const f = ctx.vec3('Factor_Vector', [0.5, 0.5, 0.5]);
      return { ...zero, Result_Vector: lerp(a, b, clampFactor ? saturate(f) : f) };
    }
    return { ...zero, Result_Vector: lerp(a, b, factor) };
  }
  if (dataType === 'RGBA') {
    const mode = ctx.prop<string>('blend_type', 'MIX');
    let result = blend(
      mode,
      factor,
      ctx.vec3('A_Color', [0.5, 0.5, 0.5]),
      ctx.vec3('B_Color', [0.5, 0.5, 0.5]),
    );
    if (!result) {
      ctx.warn(`blend mode ${mode} is not supported; using MIX`);
      result = blend('MIX', factor, ctx.vec3('A_Color'), ctx.vec3('B_Color'))!;
    }
    if (ctx.prop('clamp_result', false)) result = saturate(result);
    return { ...zero, Result_Color: result };
  }
  ctx.warn(`data type ${dataType} is not supported`);
  return zero;
};
