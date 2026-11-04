/*
 * Mapping node.
 *
 * Ported from Blender's source/blender/gpu/shaders/material/gpu_shader_material_mapping.glsl and
 * euler_to_mat3() in gpu_shader_common_math_utils.glsl (Blender 5.2).
 * SPDX-FileCopyrightText: 2019-2023 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 * Used here under AGPL-3.0-or-later (see LICENSE).
 */
import { cos, select, sin, vec3 } from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';

/** Columns of Blender's euler_to_mat3 (XYZ Euler, radians). */
export function eulerColumns(euler: Vec3Node): [Vec3Node, Vec3Node, Vec3Node] {
  const cx = cos(euler.x);
  const cy = cos(euler.y);
  const cz = cos(euler.z);
  const sx = sin(euler.x);
  const sy = sin(euler.y);
  const sz = sin(euler.z);
  return [
    vec3(cy.mul(cz), cy.mul(sz), sy.negate()),
    vec3(sy.mul(sx).mul(cz).sub(cx.mul(sz)), sy.mul(sx).mul(sz).add(cx.mul(cz)), cy.mul(sx)),
    vec3(sy.mul(cx).mul(cz).add(sx.mul(sz)), sy.mul(cx).mul(sz).sub(sx.mul(cz)), cy.mul(cx)),
  ];
}

/** M · v for a matrix given by columns. */
export function mulColumns([c0, c1, c2]: [Vec3Node, Vec3Node, Vec3Node], v: Vec3Node): Vec3Node {
  return c0.mul(v.x).add(c1.mul(v.y)).add(c2.mul(v.z));
}

/** Mᵀ · v for a matrix given by columns (the inverse, for a rotation). */
export function mulTransposed([c0, c1, c2]: [Vec3Node, Vec3Node, Vec3Node], v: Vec3Node): Vec3Node {
  return vec3(c0.dot(v), c1.dot(v), c2.dot(v));
}

/** Component-wise a / b, 0 where b == 0 (Blender's safe_divide). */
export function safeDivide(a: Vec3Node, b: Vec3Node): Vec3Node {
  return vec3(
    select(b.x.equal(0), 0, a.x.div(b.x)),
    select(b.y.equal(0), 0, a.y.div(b.y)),
    select(b.z.equal(0), 0, a.z.div(b.z)),
  );
}

export const mapping: NodeImpl = (ctx) => {
  const vector = ctx.vec3('Vector');
  const location = ctx.vec3('Location');
  const rotation = eulerColumns(ctx.vec3('Rotation'));
  const scale = ctx.vec3('Scale', [1, 1, 1]);

  let result: Vec3Node;
  switch (ctx.prop<string>('vector_type', 'POINT')) {
    case 'TEXTURE':
      result = safeDivide(mulTransposed(rotation, vector.sub(location)), scale);
      break;
    case 'VECTOR':
      result = mulColumns(rotation, vector.mul(scale));
      break;
    case 'NORMAL':
      result = mulColumns(rotation, safeDivide(vector, scale)).normalize();
      break;
    default: // POINT
      result = mulColumns(rotation, vector.mul(scale)).add(location);
  }
  return { Vector: result };
};
