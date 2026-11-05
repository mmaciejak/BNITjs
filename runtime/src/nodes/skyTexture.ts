/*
 * Sky Texture, from the equirectangular image the exporter bakes with Cycles (see
 * exporter/sky_bake.py): Blender's sky models are computed in C++ at render time, so they are
 * baked rather than evaluated. Sampled by direction like an Environment Texture.
 */
import { atan, sqrt, vec2, vec3 } from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { makeImageLookup } from './imageTexture.js';
import { textureVector } from './textureVector.js';

export const skyTexture: NodeImpl = (ctx) => {
  const lookup = makeImageLookup(ctx, 'REPEAT');
  if (!lookup) return { Color: vec3(0) };
  const d = textureVector(ctx).normalize().toVar() as Vec3Node;
  const u = atan(d.y, d.x)
    .negate()
    .div(2 * Math.PI)
    .add(0.5);
  const v = atan(d.z, sqrt(d.x.mul(d.x).add(d.y.mul(d.y))))
    .div(Math.PI)
    .add(0.5);
  return { Color: lookup(vec2(u, v)).xyz };
};
