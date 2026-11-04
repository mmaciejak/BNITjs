/*
 * Gradient Texture. Follows Cycles' svm_gradient / svm_node_tex_gradient (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { atan, clamp, float, max, saturate, sqrt, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { textureVector } from './textureVector.js';

function gradientValue(type: string, p: Vec3Node): FloatNode {
  const { x, y, z } = { x: p.x, y: p.y, z: p.z };
  switch (type) {
    case 'QUADRATIC': {
      const r = max(x, 0);
      return r.mul(r);
    }
    case 'EASING': {
      const r = clamp(x, 0, 1);
      const t = r.mul(r);
      return t.mul(3).sub(t.mul(2).mul(r));
    }
    case 'DIAGONAL':
      return x.add(y).mul(0.5);
    case 'RADIAL':
      return atan(y, x)
        .div(2 * Math.PI)
        .add(0.5);
    case 'QUADRATIC_SPHERE':
    case 'SPHERICAL': {
      const r = max(float(0.999999).sub(sqrt(x.mul(x).add(y.mul(y)).add(z.mul(z)))), 0);
      return type === 'SPHERICAL' ? r : r.mul(r);
    }
    default: // LINEAR
      return x;
  }
}

export const gradient: NodeImpl = (ctx) => {
  const f = saturate(
    gradientValue(ctx.prop<string>('gradient_type', 'LINEAR'), textureVector(ctx)),
  );
  return { Color: vec3(f), Fac: f };
};
