import { float, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

/** Diffuse BSDF → physical material with no specular. Roughness (Oren-Nayar) is not mapped. */
export const diffuse: NodeImpl = (ctx) => {
  if (ctx.isLinked('Roughness') || Number(ctx.inputValue('Roughness') ?? 0) !== 0) {
    ctx.warn('Oren-Nayar roughness has no three.js equivalent and is ignored');
  }
  return {
    BSDF: {
      kind: 'principled',
      baseColor: ctx.vec3('Color', [0.8, 0.8, 0.8]),
      metallic: float(0),
      roughness: float(1),
      alpha: float(1),
      transparent: false,
      emission: vec3(0),
      ...(ctx.isLinked('Normal') ? { normal: ctx.vec3('Normal') } : {}),
      specular: float(0),
    },
  };
};
