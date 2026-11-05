import { float, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

/** Glossy BSDF → fully metallic physical material (color = reflectance, same roughness). */
export const glossy: NodeImpl = (ctx) => {
  const anisotropic = ctx.isLinked('Anisotropy') || Number(ctx.inputValue('Anisotropy') ?? 0) !== 0;
  if (anisotropic && ctx.isLinked('Tangent')) {
    ctx.warn('the Tangent input is ignored (three.js uses mesh tangents)');
  }
  return {
    BSDF: {
      kind: 'principled',
      baseColor: ctx.vec3('Color', [0.8, 0.8, 0.8]),
      metallic: float(1),
      roughness: ctx.float('Roughness', 0.5),
      alpha: float(1),
      transparent: false,
      emission: vec3(0),
      ...(ctx.isLinked('Normal') ? { normal: ctx.vec3('Normal') } : {}),
      ...(anisotropic
        ? {
            anisotropy: {
              strength: ctx.float('Anisotropy', 0),
              rotation: ctx.float('Rotation', 0).mul(2 * Math.PI),
            },
          }
        : {}),
    },
  };
};
