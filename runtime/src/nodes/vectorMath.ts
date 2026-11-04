/*
 * Vector Math node.
 *
 * Follows Cycles' svm_vector_math() in intern/cycles/kernel/svm/math_util.h (Blender 5.2):
 * per-component safe operations, safe_normalize, project, reflect (normalised normal),
 * refract (normalised normal, eta = Scale), faceforward(vector, incident, reference).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import {
  abs,
  ceil,
  cos,
  cross,
  distance,
  dot,
  float,
  floor,
  length,
  max,
  min,
  select,
  sign,
  sin,
  sqrt,
  tan,
  vec3,
} from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { safeDivide, safeModulo, safePow, wrap } from './math.js';

const perComponent =
  (f: (a: FloatNode, b: FloatNode, c: FloatNode) => FloatNode) =>
  (a: Vec3Node, b: Vec3Node, c: Vec3Node): Vec3Node =>
    vec3(f(a.x, b.x, c.x), f(a.y, b.y, c.y), f(a.z, b.z, c.z));

export const safeNormalize = (v: Vec3Node): Vec3Node => {
  const len = length(v);
  return select(len.equal(0), vec3(0), v.div(len));
};

const project = (v: Vec3Node, onto: Vec3Node): Vec3Node => {
  const lenSq = dot(onto, onto);
  return select(lenSq.equal(0), vec3(0), onto.mul(dot(v, onto).div(lenSq)));
};

const reflect = (incident: Vec3Node, normal: Vec3Node): Vec3Node => {
  const n = safeNormalize(normal);
  return incident.sub(n.mul(dot(incident, n).mul(2)));
};

const refract = (incident: Vec3Node, normal: Vec3Node, eta: FloatNode): Vec3Node => {
  const n = safeNormalize(normal);
  const ni = dot(n, incident);
  const k = float(1).sub(eta.mul(eta).mul(float(1).sub(ni.mul(ni))));
  return select(
    k.lessThan(0),
    vec3(0),
    incident.mul(eta).sub(n.mul(eta.mul(ni).add(sqrt(max(k, 0))))),
  );
};

type VectorOp = (a: Vec3Node, b: Vec3Node, c: Vec3Node, scale: FloatNode) => Vec3Node;
type ValueOp = (a: Vec3Node, b: Vec3Node) => FloatNode;

const VECTOR_OPS: Record<string, VectorOp> = {
  ADD: (a, b) => a.add(b),
  SUBTRACT: (a, b) => a.sub(b),
  MULTIPLY: (a, b) => a.mul(b),
  DIVIDE: perComponent(safeDivide),
  MULTIPLY_ADD: (a, b, c) => a.mul(b).add(c),
  CROSS_PRODUCT: (a, b) => cross(a, b),
  PROJECT: (a, b) => project(a, b),
  REFLECT: (a, b) => reflect(a, b),
  REFRACT: (a, b, _c, scale) => refract(a, b, scale),
  FACEFORWARD: (a, b, c) => select(dot(c, b).lessThan(0), a, a.negate()),
  SCALE: (a, _b, _c, scale) => a.mul(scale),
  NORMALIZE: (a) => safeNormalize(a),
  ABSOLUTE: (a) => abs(a),
  POWER: perComponent(safePow),
  SIGN: (a) => sign(a),
  MINIMUM: (a, b) => min(a, b),
  MAXIMUM: (a, b) => max(a, b),
  ROUND: (a) => floor(a.add(0.5)),
  FLOOR: (a) => floor(a),
  CEIL: (a) => ceil(a),
  FRACTION: (a) => a.sub(floor(a)),
  MODULO: perComponent(safeModulo),
  WRAP: perComponent(wrap),
  SNAP: (a, b) => floor(perComponent(safeDivide)(a, b, b)).mul(b),
  SINE: (a) => sin(a),
  COSINE: (a) => cos(a),
  TANGENT: (a) => tan(a),
};

const VALUE_OPS: Record<string, ValueOp> = {
  DOT_PRODUCT: (a, b) => dot(a, b),
  DISTANCE: (a, b) => distance(a, b),
  LENGTH: (a) => length(a),
};

export const vectorMath: NodeImpl = (ctx) => {
  const operation = ctx.prop<string>('operation', 'ADD');
  const a = ctx.vec3('Vector');
  const b = ctx.vec3('Vector_001');
  const valueOp = VALUE_OPS[operation];
  if (valueOp) return { Vector: vec3(0), Value: valueOp(a, b) };
  let op = VECTOR_OPS[operation];
  if (!op) {
    ctx.warn(`operation ${operation} is not supported; using ADD`);
    op = VECTOR_OPS.ADD!;
  }
  return { Vector: op(a, b, ctx.vec3('Vector_002'), ctx.float('Scale', 1)), Value: float(0) };
};
