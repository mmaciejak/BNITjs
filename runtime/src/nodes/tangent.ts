/*
 * Tangent. Follows Cycles' svm_node_tangent (Blender 5.2): a radial tangent around an axis of the
 * Generated coordinates, made perpendicular to the normal. UV Map tangents need glTF tangents.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { cross, modelNormalMatrix, vec3 } from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { generatedCoords, shadingNormalBlender, toBlender } from './space.js';

/** Blender object-space direction → Blender world axes (Cycles' object_normal_transform). */
function objectToWorldDir(d: Vec3Node): Vec3Node {
  const local = vec3(d.x, d.z, d.y.negate()); // Blender → glTF axes
  return toBlender(modelNormalMatrix.mul(local));
}

/** The radial tangent around `axis` of Generated, perpendicular to `n` (Blender world axes). */
export function radialTangent(axis: string, n: Vec3Node): Vec3Node {
  const g = generatedCoords().sub(0.5);
  const around =
    axis === 'X'
      ? vec3(0, g.z.negate(), g.y)
      : axis === 'Y'
        ? vec3(g.z.negate(), 0, g.x)
        : vec3(g.y.negate(), g.x, 0);
  const t = objectToWorldDir(around);
  return cross(n, cross(t, n).normalize()) as Vec3Node;
}

export const tangent: NodeImpl = (ctx) => {
  const n = shadingNormalBlender();
  if (ctx.prop<string>('direction_type', 'RADIAL') === 'UV_MAP') {
    ctx.warn('UV Map tangents are not supported yet; using the radial Z tangent');
    return { Tangent: radialTangent('Z', n) };
  }
  return { Tangent: radialTangent(ctx.prop<string>('axis', 'Z'), n) };
};
