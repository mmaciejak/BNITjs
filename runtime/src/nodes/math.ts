/*
 * Math node.
 *
 * Follows Cycles' svm_math() and the safe_* helpers in intern/cycles/util/math_float.h and
 * svm/math_util.h (Blender 5.2), since parity references are rendered with Cycles.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import {
  abs,
  acos,
  asin,
  atan,
  ceil,
  clamp,
  cos,
  cosh,
  exp,
  float,
  floor,
  fract,
  log,
  max,
  min,
  pow,
  saturate,
  select,
  sign,
  sin,
  sinh,
  sqrt,
  tan,
  tanh,
  trunc,
} from 'three/tsl';
import type { FloatNode } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';

const FLT_EPSILON = 1.1920929e-7;

export const safeDivide = (a: FloatNode, b: FloatNode): FloatNode =>
  select(b.equal(0), float(0), a.div(b));

/** C fmodf: truncated remainder, sign of a. */
export const fmod = (a: FloatNode, b: FloatNode): FloatNode => a.sub(b.mul(trunc(a.div(b))));

export const safeModulo = (a: FloatNode, b: FloatNode): FloatNode =>
  select(b.equal(0), float(0), fmod(a, b));

export const flooredModulo = (a: FloatNode, b: FloatNode): FloatNode =>
  select(b.equal(0), float(0), a.sub(floor(a.div(b)).mul(b)));

/** Cycles compatible_powf + safe_powf: negative base only with an integer exponent. */
export function safePow(a: FloatNode, b: FloatNode): FloatNode {
  const nonInteger = b.notEqual(trunc(b));
  const magnitude = pow(abs(a), b);
  const odd = fmod(b, float(2)).notEqual(0);
  const negative = select(odd, magnitude.negate(), magnitude);
  return select(
    a.lessThan(0).and(nonInteger),
    float(0),
    select(
      b.equal(0),
      float(1),
      select(a.lessThan(0), negative, select(a.equal(0), float(0), magnitude)),
    ),
  );
}

/** wrapf(value, max, min). */
export const wrap = (value: FloatNode, hi: FloatNode, lo: FloatNode): FloatNode => {
  const range = hi.sub(lo);
  return select(range.equal(0), lo, value.sub(range.mul(floor(value.sub(lo).div(range)))));
};

export const pingpong = (a: FloatNode, b: FloatNode): FloatNode =>
  select(
    b.equal(0),
    float(0),
    abs(
      fract(a.sub(b).div(b.mul(2)))
        .mul(b)
        .mul(2)
        .sub(b),
    ),
  );

export const smoothMin = (a: FloatNode, b: FloatNode, k: FloatNode): FloatNode => {
  const h = max(k.sub(abs(a.sub(b))), 0).div(k);
  return select(k.equal(0), min(a, b), min(a, b).sub(h.mul(h).mul(h).mul(k).div(6)));
};

type Op = (a: FloatNode, b: FloatNode, c: FloatNode) => FloatNode;

export const MATH_OPS: Record<string, Op> = {
  ADD: (a, b) => a.add(b),
  SUBTRACT: (a, b) => a.sub(b),
  MULTIPLY: (a, b) => a.mul(b),
  DIVIDE: safeDivide,
  MULTIPLY_ADD: (a, b, c) => a.mul(b).add(c),
  POWER: safePow,
  LOGARITHM: (a, b) =>
    select(a.lessThanEqual(0).or(b.lessThanEqual(0)), float(0), safeDivide(log(a), log(b))),
  SQRT: (a) => select(a.greaterThan(0), sqrt(a), float(0)),
  INVERSE_SQRT: (a) => select(a.greaterThan(0), float(1).div(sqrt(a)), float(0)),
  ABSOLUTE: (a) => abs(a),
  EXPONENT: (a) => exp(a),
  MINIMUM: (a, b) => min(a, b),
  MAXIMUM: (a, b) => max(a, b),
  LESS_THAN: (a, b) => select(a.lessThan(b), float(1), float(0)),
  GREATER_THAN: (a, b) => select(a.greaterThan(b), float(1), float(0)),
  SIGN: (a) => sign(a),
  COMPARE: (a, b, c) =>
    select(abs(a.sub(b)).lessThanEqual(max(c, FLT_EPSILON)), float(1), float(0)),
  SMOOTH_MIN: smoothMin,
  SMOOTH_MAX: (a, b, c) => smoothMin(a.negate(), b.negate(), c).negate(),
  ROUND: (a) => floor(a.add(0.5)),
  FLOOR: (a) => floor(a),
  CEIL: (a) => ceil(a),
  TRUNC: (a) => trunc(a),
  FRACT: (a) => a.sub(floor(a)),
  MODULO: safeModulo,
  FLOORED_MODULO: flooredModulo,
  WRAP: wrap,
  SNAP: (a, b) => floor(safeDivide(a, b)).mul(b),
  PINGPONG: pingpong,
  SINE: (a) => sin(a),
  COSINE: (a) => cos(a),
  TANGENT: (a) => tan(a),
  ARCSINE: (a) => asin(clamp(a, -1, 1)),
  ARCCOSINE: (a) => acos(clamp(a, -1, 1)),
  ARCTANGENT: (a) => atan(a),
  ARCTAN2: (a, b) => atan(a, b),
  SINH: (a) => sinh(a),
  COSH: (a) => cosh(a),
  TANH: (a) => tanh(a),
  RADIANS: (a) => a.mul(Math.PI / 180),
  DEGREES: (a) => a.mul(180 / Math.PI),
};

export const math: NodeImpl = (ctx) => {
  const operation = ctx.prop<string>('operation', 'ADD');
  let op = MATH_OPS[operation];
  if (!op) {
    ctx.warn(`operation ${operation} is not supported; using ADD`);
    op = MATH_OPS.ADD!;
  }
  let result = op(
    ctx.float('Value', 0.5),
    ctx.float('Value_001', 0.5),
    ctx.float('Value_002', 0.5),
  );
  if (ctx.prop('use_clamp', false)) result = saturate(result);
  return { Value: result };
};
