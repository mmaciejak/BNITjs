/*
 * Vector Rotate node. Follows Cycles' svm_vector_rotate (Blender 5.2): Euler XYZ uses
 * euler_to_transform (inverse = transpose), axis modes use rotate_around_axis (Rodrigues).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { cos, cross, dot, float, normalize, select, sin, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { eulerColumns, mulColumns, mulTransposed } from './mapping.js';

function rotateAroundAxis(p: Vec3Node, axis: Vec3Node, angle: FloatNode): Vec3Node {
  const c = cos(angle);
  const s = sin(angle);
  return p
    .mul(c)
    .add(cross(axis, p).mul(s))
    .add(axis.mul(dot(axis, p).mul(float(1).sub(c))));
}

export const vectorRotate: NodeImpl = (ctx) => {
  const type = ctx.prop<string>('rotation_type', 'AXIS_ANGLE');
  const invert = ctx.prop('invert', false);
  const vector = ctx.vec3('Vector');
  const center = ctx.vec3('Center');
  const p = vector.sub(center);

  if (type === 'EULER_XYZ') {
    const m = eulerColumns(ctx.vec3('Rotation'));
    return { Vector: (invert ? mulTransposed(m, p) : mulColumns(m, p)).add(center) };
  }

  const angle = invert ? ctx.float('Angle').negate() : ctx.float('Angle');
  const fixed: Record<string, [number, number, number]> = {
    X_AXIS: [1, 0, 0],
    Y_AXIS: [0, 1, 0],
    Z_AXIS: [0, 0, 1],
  };
  const fixedAxis = fixed[type];
  if (fixedAxis) return { Vector: rotateAroundAxis(p, vec3(...fixedAxis), angle).add(center) };

  const rawAxis = ctx.vec3('Axis', [0, 0, 1]);
  const rotated = rotateAroundAxis(p, normalize(rawAxis), angle).add(center);
  return { Vector: select(dot(rawAxis, rawAxis).equal(0), vector, rotated) };
};
