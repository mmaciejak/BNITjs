/*
 * Bump. Follows Blender's gpu_shader_material_bump.glsl and Cycles' svm_node_set_bump (Blender
 * 5.2): the height's screen-space differences along the surface tangents Rx, Ry perturb the normal
 * by its surface gradient. The result does not depend on the size of the differences (Filter
 * Width only sets that size), so per-pixel derivatives give Cycles' result for smooth heights.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 */
import {
  abs,
  cross,
  dFdx,
  dFdy,
  dot,
  frontFacing,
  max,
  mix,
  positionWorld,
  select,
  sign,
} from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { shadingNormalBlender, toBlender } from './space.js';

export const bump: NodeImpl = (ctx) => {
  const n = (ctx.isLinked('Normal') ? ctx.vec3('Normal') : shadingNormalBlender())
    .normalize()
    .toVar() as Vec3Node;
  if (!ctx.isLinked('Height')) return { Normal: n };
  const h = ctx.float('Height', 1);
  const invert = ctx.prop<boolean>('invert', false) ? -1 : 1;
  const distance = ctx.float('Distance', 1).mul(invert);
  const dist = select(frontFacing, distance, distance.negate()) as FloatNode;
  const p = toBlender(positionWorld);
  const dPdx = dFdx(p).toVar() as Vec3Node;
  const dPdy = dFdy(p).toVar() as Vec3Node;
  const rx = cross(dPdy, n).toVar() as Vec3Node;
  const ry = cross(n, dPdx).toVar() as Vec3Node;
  const det = dot(dPdx, rx).toVar() as FloatNode;
  const surfgrad = rx.mul(dFdx(h)).add(ry.mul(dFdy(h)));
  const result = abs(det)
    .mul(n)
    .sub(dist.mul(sign(det)).mul(surfgrad))
    .normalize();
  const strength = max(ctx.float('Strength', 1), 0);
  return { Normal: mix(n, result, strength).normalize() };
};
