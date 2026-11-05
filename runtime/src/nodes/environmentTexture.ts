/*
 * Environment Texture. Follows Blender's gpu_shader_material_tex_environment.glsl (Blender 5.2) and
 * Cycles' svm_node_tex_environment: the direction is normalised and mapped to the image by an
 * equirectangular or mirror-ball projection, then sampled like an Image Texture (Repeat).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 */
import { atan, max, sqrt, vec2, vec3 } from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { makeImageLookup } from './imageTexture.js';
import { textureVector } from './textureVector.js';

const TWO_PI = 2 * Math.PI;

export const environmentTexture: NodeImpl = (ctx) => {
  const lookup = makeImageLookup(ctx, 'REPEAT');
  if (!lookup) return { Color: vec3(1, 0, 1) };
  const d = textureVector(ctx).normalize().toVar() as Vec3Node;
  let uv;
  if (ctx.prop<string>('projection', 'EQUIRECTANGULAR') === 'MIRROR_BALL') {
    const y = d.y.sub(1);
    const div = max(sqrt(max(y.mul(-0.5), 0)).mul(2), 1e-8);
    uv = vec2(d.x.div(div), d.z.div(div)).mul(0.5).add(0.5);
  } else {
    const u = atan(d.y, d.x).negate().div(TWO_PI).add(0.5);
    const v = atan(d.z, sqrt(d.x.mul(d.x).add(d.y.mul(d.y))))
      .div(Math.PI)
      .add(0.5);
    uv = vec2(u, v);
  }
  return { Color: lookup(uv).xyz };
};
