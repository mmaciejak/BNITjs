/*
 * Magic Texture. Ported from Blender's gpu_shader_material_tex_magic.glsl (Blender 5.2), which
 * matches Cycles' svm_node_tex_magic.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 */
import { cos, float, floor, select, sin, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { textureVector } from './textureVector.js';

const TWO_PI = 2 * Math.PI;

export const magic: NodeImpl = (ctx) => {
  const depth = ctx.prop<number>('turbulence_depth', 2);
  const distortion = ctx.float('Distortion', 1);
  const co = textureVector(ctx).mul(ctx.float('Scale', 5));
  // GLSL mod (floored).
  const p = co.sub(floor(co.div(TWO_PI)).mul(TWO_PI)).toVar() as Vec3Node;

  let x = sin(p.x.add(p.y).add(p.z).mul(5)) as FloatNode;
  let y = cos(p.x.negate().add(p.y).sub(p.z).mul(5)) as FloatNode;
  let z = cos(p.x.negate().sub(p.y).add(p.z).mul(5)).negate() as FloatNode;
  const d = (v: FloatNode) => v.mul(distortion).toVar() as FloatNode;
  if (depth > 0) {
    x = d(x);
    y = d(y);
    z = d(z);
    y = d(cos(x.sub(y).add(z)).negate() as FloatNode);
    // Each further level rewrites one component from all three (Blender's fixed sequence).
    const steps: Array<['x' | 'y' | 'z', () => FloatNode]> = [
      ['x', () => cos(x.sub(y).sub(z)) as FloatNode],
      ['z', () => sin(x.negate().sub(y).sub(z)) as FloatNode],
      ['x', () => cos(x.negate().add(y).sub(z)).negate() as FloatNode],
      ['y', () => sin(x.negate().add(y).add(z)).negate() as FloatNode],
      ['y', () => cos(x.negate().add(y).add(z)).negate() as FloatNode],
      ['x', () => cos(x.add(y).add(z)) as FloatNode],
      ['z', () => sin(x.add(y).sub(z)) as FloatNode],
      ['x', () => cos(x.negate().sub(y).add(z)).negate() as FloatNode],
      ['y', () => sin(x.sub(y).add(z)).negate() as FloatNode],
    ];
    for (const [axis, value] of steps.slice(0, Math.min(depth, 10) - 1)) {
      const v = d(value());
      if (axis === 'x') x = v;
      else if (axis === 'y') y = v;
      else z = v;
    }
  }
  // if (distortion != 0) divide by 2·distortion
  const div = distortion.mul(2);
  const safe = (v: FloatNode) => select(div.equal(0), v, v.div(div)) as FloatNode;
  const color = vec3(float(0.5).sub(safe(x)), float(0.5).sub(safe(y)), float(0.5).sub(safe(z)));
  return { Color: color, Fac: color.x.add(color.y).add(color.z).div(3) };
};
