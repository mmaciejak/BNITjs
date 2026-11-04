/*
 * Fresnel and fresnel_dielectric_cos. Follow Cycles' svm_node_fresnel and
 * util/fresnel (fresnel_dielectric_cos) in Blender 5.2.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { abs, dot, float, max, select, sqrt } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeContext, NodeImpl } from '../graph/evaluate.js';
import { shadingNormalBlender, viewDirBlender } from './space.js';

export function fresnelDielectricCos(cosi: FloatNode, eta: FloatNode): FloatNode {
  const c = abs(cosi);
  const g2 = eta.mul(eta).sub(1).add(c.mul(c));
  const g = sqrt(max(g2, 0));
  const a = g.sub(c).div(g.add(c));
  const b = c
    .mul(g.add(c))
    .sub(1)
    .div(c.mul(g.sub(c)).add(1));
  return select(g2.greaterThan(0), a.mul(a).mul(b.mul(b).add(1)).mul(0.5), float(1));
}

/** A Normal input, or the shading normal when it is unlinked (Blender world axes). */
export function normalInput(ctx: NodeContext, identifier = 'Normal'): Vec3Node {
  return ctx.isLinked(identifier) ? ctx.vec3(identifier) : shadingNormalBlender();
}

export const fresnel: NodeImpl = (ctx) => {
  const eta = max(ctx.float('IOR', 1.5), 1e-5);
  return { Fac: fresnelDielectricCos(dot(viewDirBlender(), normalInput(ctx)), eta) };
};
