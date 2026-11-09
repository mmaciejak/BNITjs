/**
 * Hard-tier BSDFs (Phase 10) as three.js physical-material parameters. None of them is
 * parity-tested: lighting differs between three.js and Cycles.
 */
import { float, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

/** Sheen BSDF: three.js's sheen layer (Charlie) over a black, non-specular base. */
export const sheen: NodeImpl = (ctx) => {
  if (ctx.prop<string>('distribution', 'MICROFIBER') !== 'MICROFIBER') {
    ctx.warn('the Ashikhmin distribution is rendered as three.js sheen (Charlie)');
  }
  return {
    BSDF: {
      kind: 'principled',
      baseColor: vec3(0),
      metallic: float(0),
      roughness: float(1),
      alpha: float(1),
      transparent: false,
      emission: vec3(0),
      specular: float(0),
      sheen: { color: ctx.vec3('Color', [0.8, 0.8, 0.8]), roughness: ctx.float('Roughness', 0.5) },
      ...(ctx.isLinked('Normal') ? { normal: ctx.vec3('Normal') } : {}),
    },
  };
};
