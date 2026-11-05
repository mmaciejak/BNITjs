/*
 * Geometry. Follows Cycles' svm_node_geometry and primitive_tangent (Blender 5.2), in Blender's
 * world axes.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 *
 * Parametric, Pointiness and Random Per Island need mesh data the exporter does not write yet:
 * they are 0 (with a warning).
 */
import { cross, dFdx, dFdy, dot, float, frontFacing, positionWorld, select, vec3 } from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { radialTangent } from './tangent.js';
import { shadingNormalBlender, toBlender, viewDirBlender } from './space.js';

/** Cycles' Ng: the face normal, flipped like N to face the incoming ray. */
export function trueNormalBlender(): Vec3Node {
  const p = toBlender(positionWorld);
  const ng = cross(dFdx(p), dFdy(p)).normalize();
  return select(dot(ng, viewDirBlender()).lessThan(0), ng.negate(), ng) as Vec3Node;
}

export const geometry: NodeImpl = (ctx) => {
  for (const name of ['Parametric', 'Pointiness', 'Random Per Island']) {
    if (ctx.isOutputLinked(name)) ctx.warn(`${name} is not supported yet; using 0`);
  }
  const n = shadingNormalBlender();
  return {
    Position: toBlender(positionWorld),
    Normal: n,
    Tangent: radialTangent('Z', n),
    'True Normal': trueNormalBlender(),
    Incoming: viewDirBlender(),
    Parametric: vec3(0),
    Backfacing: select(frontFacing, float(0), float(1)),
    Pointiness: float(0),
    'Random Per Island': float(0),
  };
};
