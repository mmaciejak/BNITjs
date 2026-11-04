/*
 * Layer Weight. Follows Cycles' svm_node_layer_weight (Blender 5.2), front faces.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { abs, clamp, dot, float, max, pow, select } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { fresnelDielectricCos, normalInput } from './fresnel.js';
import { viewDirBlender } from './space.js';

export const layerWeight: NodeImpl = (ctx) => {
  const blend = ctx.float('Blend', 0.5);
  const cos = dot(viewDirBlender(), normalInput(ctx));
  const eta = float(1).div(max(float(1).sub(blend), 1e-5));
  const facingBase = abs(cos);
  const b = clamp(blend, 0, 1 - 1e-5);
  const exponent = select(b.lessThan(0.5), b.mul(2), float(0.5).div(float(1).sub(b)));
  const facing = float(1).sub(select(blend.equal(0.5), facingBase, pow(facingBase, exponent)));
  return { Fresnel: fresnelDielectricCos(cos, eta), Facing: facing };
};
