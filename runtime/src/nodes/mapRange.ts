/*
 * Map Range node. Follows Cycles' svm_map_range / svm_vector_map_range (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { clamp, float, floor, max, min, select, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { safeDivide } from './math.js';

/** Cycles smoothstep(edge0, edge1, x). */
function smoothstep(e0: FloatNode, e1: FloatNode, x: FloatNode): FloatNode {
  const t = x.sub(e0).div(e1.sub(e0));
  const s = t.mul(t).mul(float(3).sub(t.mul(2)));
  return select(x.lessThan(e0), float(0), select(x.greaterThanEqual(e1), float(1), s));
}

/** Cycles smootherstep(edge0, edge1, x). */
function smootherstep(e0: FloatNode, e1: FloatNode, x: FloatNode): FloatNode {
  const t = clamp(safeDivide(x.sub(e0), e1.sub(e0)), 0, 1);
  return t
    .mul(t)
    .mul(t)
    .mul(t.mul(t.mul(6).sub(15)).add(10));
}

function mapOne(
  type: string,
  doClamp: boolean,
  value: FloatNode,
  fromMin: FloatNode,
  fromMax: FloatNode,
  toMin: FloatNode,
  toMax: FloatNode,
  steps: FloatNode,
): FloatNode {
  let factor: FloatNode;
  const reversed = fromMin.greaterThan(fromMax);
  switch (type) {
    case 'STEPPED': {
      const f = safeDivide(value.sub(fromMin), fromMax.sub(fromMin));
      factor = select(steps.greaterThan(0), floor(f.mul(steps.add(1))).div(steps), float(0));
      break;
    }
    case 'SMOOTHSTEP':
      factor = select(
        reversed,
        float(1).sub(smoothstep(fromMax, fromMin, value)),
        smoothstep(fromMin, fromMax, value),
      );
      break;
    case 'SMOOTHERSTEP':
      factor = select(
        reversed,
        float(1).sub(smootherstep(fromMax, fromMin, value)),
        smootherstep(fromMin, fromMax, value),
      );
      break;
    default: // LINEAR
      factor = safeDivide(value.sub(fromMin), fromMax.sub(fromMin));
  }
  let result = toMin.add(factor.mul(toMax.sub(toMin)));
  if (doClamp && (type === 'LINEAR' || type === 'STEPPED')) {
    // Equivalent to Cycles' "to_min > to_max ? clamp(r, to_max, to_min) : clamp(r, to_min, to_max)".
    // Not written with select(): with constant bounds, the branch not taken is a clamp() with
    // low > high, which is a WGSL shader-creation error, so the whole material fails.
    result = clamp(result, min(toMin, toMax), max(toMin, toMax));
  }
  return result;
}

export const mapRange: NodeImpl = (ctx) => {
  const type = ctx.prop<string>('interpolation_type', 'LINEAR');
  const doClamp = ctx.prop('clamp', true);
  if (ctx.prop<string>('data_type', 'FLOAT') === 'FLOAT_VECTOR') {
    const v = ctx.vec3('Vector');
    const fromMin = ctx.vec3('From_Min_FLOAT3');
    const fromMax = ctx.vec3('From_Max_FLOAT3', [1, 1, 1]);
    const toMin = ctx.vec3('To_Min_FLOAT3');
    const toMax = ctx.vec3('To_Max_FLOAT3', [1, 1, 1]);
    const steps = ctx.vec3('Steps_FLOAT3', [4, 4, 4]);
    const axis = (c: 'x' | 'y' | 'z') =>
      mapOne(type, doClamp, v[c], fromMin[c], fromMax[c], toMin[c], toMax[c], steps[c]);
    const result: Vec3Node = vec3(axis('x'), axis('y'), axis('z'));
    return { Result: float(0), Vector: result };
  }
  const result = mapOne(
    type,
    doClamp,
    ctx.float('Value', 1),
    ctx.float('From Min', 0),
    ctx.float('From Max', 1),
    ctx.float('To Min', 0),
    ctx.float('To Max', 1),
    ctx.float('Steps', 4),
  );
  return { Result: result, Vector: vec3(0) };
};
