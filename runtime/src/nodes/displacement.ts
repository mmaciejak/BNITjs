/*
 * Displacement and Vector Displacement. Follow Cycles' svm_node_displacement and
 * svm_node_vector_displacement (Blender 5.2). Both output the offset in Blender's world axes; the
 * Material Output turns it into a bump (the default "Bump Only" method) or moves the vertices.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { modelWorldMatrix, transpose, vec3, vec4 } from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { shadingNormalBlender, toBlender } from './space.js';

const fromBlender = (v: Vec3Node): Vec3Node => vec3(v.x, v.z, v.y.negate());

/** World → object normal (Cycles' object_inverse_normal_transform), Blender axes. */
const worldToObjectNormal = (n: Vec3Node): Vec3Node =>
  toBlender(transpose(modelWorldMatrix).mul(vec4(fromBlender(n), 0)).xyz);
/** Object → world direction (object_dir_transform), Blender axes. */
const objectToWorldDir = (d: Vec3Node): Vec3Node =>
  toBlender(modelWorldMatrix.mul(vec4(fromBlender(d), 0)).xyz);

export const displacement: NodeImpl = (ctx) => {
  const n = ctx.isLinked('Normal') ? ctx.vec3('Normal') : shadingNormalBlender();
  const amount = ctx.float('Height', 0).sub(ctx.float('Midlevel', 0.5)).mul(ctx.float('Scale', 1));
  if (ctx.prop<string>('space', 'OBJECT') === 'WORLD') return { Displacement: n.mul(amount) };
  return { Displacement: objectToWorldDir(worldToObjectNormal(n).mul(amount)) };
};

export const vectorDisplacement: NodeImpl = (ctx) => {
  const space = ctx.prop<string>('space', 'TANGENT');
  const v = ctx
    .vec3('Vector', [0, 0, 0])
    .sub(ctx.float('Midlevel', 0))
    .mul(ctx.float('Scale', 1)) as Vec3Node;
  if (space === 'WORLD') return { Displacement: v };
  if (space === 'OBJECT') return { Displacement: objectToWorldDir(v) };
  ctx.warn('Tangent space is not supported yet; using object space');
  return { Displacement: objectToWorldDir(v) };
};
