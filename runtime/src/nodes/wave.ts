/*
 * Wave Texture. Ported from Blender's gpu_shader_material_tex_wave.glsl (Blender 5.2), which
 * matches Cycles' svm_node_tex_wave.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 */
import { clamp, float, floor, length, sin, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { type P, fractal } from './perlin.js';
import { textureVector } from './textureVector.js';

const TWO_PI = 2 * Math.PI;

export const wave: NodeImpl = (ctx) => {
  const type = ctx.prop<string>('wave_type', 'BANDS');
  const bands = ctx.prop<string>('bands_direction', 'X');
  const rings = ctx.prop<string>('rings_direction', 'X');
  const profile = ctx.prop<string>('wave_profile', 'SIN');

  const co = textureVector(ctx).mul(ctx.float('Scale', 5));
  const p = co.add(0.000001).mul(0.999999).toVar() as Vec3Node;

  let n: FloatNode;
  if (type === 'BANDS') {
    n = (
      bands === 'Y'
        ? p.y.mul(20)
        : bands === 'Z'
          ? p.z.mul(20)
          : bands === 'DIAGONAL'
            ? p.x.add(p.y).add(p.z).mul(10)
            : p.x.mul(20)
    ) as FloatNode;
  } else {
    const mask = { X: [0, 1, 1], Y: [1, 0, 1], Z: [1, 1, 0] }[rings] as
      [number, number, number] | undefined;
    const rp = mask ? p.mul(vec3(...mask)) : p;
    n = length(rp).mul(20) as FloatNode;
  }
  n = n.add(ctx.float('Phase Offset', 0)) as FloatNode;

  const distortion = ctx.float('Distortion', 0);
  if (ctx.isLinked('Distortion') || ctx.inputValue('Distortion') !== 0) {
    const noise = fractal('FBM', 3, true, p.mul(ctx.float('Detail Scale', 1)) as unknown as P, {
      detail: clamp(ctx.float('Detail', 2), 0, 15) as FloatNode,
      roughness: ctx.float('Detail Roughness', 0.5),
      lacunarity: float(2),
      offset: float(0),
      gain: float(0),
    });
    n = n.add(distortion.mul(noise.mul(2).sub(1))) as FloatNode;
  }

  let f: FloatNode;
  if (profile === 'SAW') {
    const t = n.div(TWO_PI);
    f = t.sub(floor(t)) as FloatNode;
  } else if (profile === 'TRI') {
    const t = n.div(TWO_PI);
    f = t
      .sub(floor(t.add(0.5)))
      .abs()
      .mul(2) as FloatNode;
  } else {
    f = sin(n.sub(Math.PI / 2))
      .mul(0.5)
      .add(0.5) as FloatNode;
  }
  return { Color: vec3(f), Fac: f };
};
