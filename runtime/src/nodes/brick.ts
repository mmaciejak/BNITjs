/*
 * Brick Texture. Ported from Blender's gpu_shader_material_tex_brick.glsl and integer_noise from
 * gpu_shader_common_hash.glsl (Blender 5.2), which match Cycles' svm_node_tex_brick.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 */
import { Fn, abs, clamp, float, floor, int, min, mix, select, smoothstep, uint } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { textureVector } from './textureVector.js';

type I = Node<'int'>;
type U = Node<'uint'>;

/** integer_noise: a hash of an int to [0, 1). */
const integerNoise = Fn(
  ([n]: [I]) => {
    let nn = n.toUint().add(uint(1013)).bitAnd(uint(0x7fffffff)).toVar() as U;
    nn = nn.shiftRight(uint(13)).bitXor(nn).toVar() as U;
    const poly = nn.mul(nn.mul(nn).mul(uint(60493)).add(uint(19990303)));
    nn = poly.add(uint(1376312589)).bitAnd(uint(0x7fffffff)).toVar() as U;
    return float(0.5).mul(nn.toFloat().div(1073741824));
  },
  { n: 'int', return: 'float' },
) as unknown as (n: I) => FloatNode;

/** a % n != 0 for ints, without relying on % of negative ints (undefined in GLSL ES). */
const notMultiple = (a: I, n: number): Node<'bool'> =>
  abs(a).toUint().mod(uint(n)).notEqual(uint(0)) as unknown as Node<'bool'>;

export const brick: NodeImpl = (ctx) => {
  const offsetAmount = ctx.prop<number>('offset', 0.5);
  const offsetFrequency = ctx.prop<number>('offset_frequency', 2);
  const squashAmount = ctx.prop<number>('squash', 1);
  const squashFrequency = ctx.prop<number>('squash_frequency', 2);

  const p = textureVector(ctx).mul(ctx.float('Scale', 5)).toVar() as Vec3Node;
  const mortarSize = ctx.float('Mortar Size', 0.02);
  const mortarSmooth = ctx.float('Mortar Smooth', 0.1);
  const bias = ctx.float('Bias', 0);
  let brickWidth = ctx.float('Brick Width', 0.5);
  const rowHeight = ctx.float('Row Height', 0.25);

  const rownum = floor(p.y.div(rowHeight)).toInt().toVar() as I;
  let offset: FloatNode = float(0);
  if (offsetFrequency !== 0 && squashFrequency !== 0) {
    brickWidth = select(
      notMultiple(rownum, squashFrequency),
      brickWidth,
      brickWidth.mul(squashAmount),
    ).toVar() as FloatNode;
    offset = select(
      notMultiple(rownum, offsetFrequency),
      float(0),
      brickWidth.mul(offsetAmount),
    ) as FloatNode;
  }
  const bricknum = floor(p.x.add(offset).div(brickWidth)).toInt().toVar() as I;
  const x = p.x.add(offset).sub(brickWidth.mul(bricknum.toFloat())).toVar() as FloatNode;
  const y = p.y.sub(rowHeight.mul(rownum.toFloat())).toVar() as FloatNode;

  const seed = rownum.shiftLeft(int(16)).add(bricknum.bitAnd(int(0xffff))) as I;
  const tint = clamp(integerNoise(seed).add(bias), 0, 1).toVar() as FloatNode;
  const minDist = min(min(x, y), min(brickWidth.sub(x), rowHeight.sub(y))).toVar() as FloatNode;
  // A constant Mortar Smooth of 0 skips smoothstep(0, 0, x), which WGSL may reject.
  const sharp = !ctx.isLinked('Mortar Smooth') && ctx.inputValue('Mortar Smooth') === 0;
  const inMortar = sharp
    ? float(1)
    : select(
        mortarSmooth.equal(0),
        float(1),
        smoothstep(0, mortarSmooth, float(1).sub(minDist.div(mortarSize))),
      );
  const f = select(minDist.greaterThanEqual(mortarSize), float(0), inMortar).toVar() as FloatNode;

  const color1 = ctx.vec3('Color1', [0.8, 0.8, 0.8]);
  const color2 = ctx.vec3('Color2', [0.2, 0.2, 0.2]);
  const mortar = ctx.vec3('Mortar', [0, 0, 0]);
  const tinted = select(f.notEqual(1), mix(color1, color2, tint), color1) as Vec3Node;
  return { Color: mix(tinted, mortar, f) as Vec3Node, Fac: f };
};
