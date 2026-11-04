/*
 * Checker Texture. Follows Cycles' svm_checker / svm_node_tex_checker (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { abs, float, floor, mod, select } from 'three/tsl';
import type { FloatNode } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { textureVector } from './textureVector.js';

const parity = (v: FloatNode) => mod(abs(floor(v.add(0.000001).mul(0.999999))), 2);

export const checker: NodeImpl = (ctx) => {
  const p = textureVector(ctx).mul(ctx.float('Scale', 5));
  const xi = parity(p.x);
  const yi = parity(p.y);
  const zi = parity(p.z);
  const same = select(xi.equal(yi), float(1), float(0));
  const f = select(same.equal(zi), float(1), float(0));
  const color = select(
    f.equal(1),
    ctx.vec3('Color1', [0.8, 0.8, 0.8]),
    ctx.vec3('Color2', [0.2, 0.2, 0.2]),
  );
  return { Color: color, Fac: f };
};
