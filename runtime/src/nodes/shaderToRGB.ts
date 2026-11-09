/**
 * Shader to RGB (EEVEE only; Cycles does not support it). The color a shader produces:
 *
 * - Emission and Transparent: exact. Color is the radiance, Alpha the opacity.
 * - A BSDF: its lit color, read from three.js's lighting (the material's `output`). That works when
 *   the result reaches the Material Output through an Emission shader (the usual toon setup):
 *   the material is then built from the BSDF, with the emission as its outputNode. Otherwise, in
 *   unlit mode, or for a second BSDF, the BSDF's base color stands in, with a warning.
 */
import { float, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

export const shaderToRGB: NodeImpl = (ctx) => {
  const shader = ctx.shader('Shader');
  if (!shader) return { Color: vec3(0), Alpha: float(1) };
  if (shader.kind === 'emission') {
    return { Color: shader.color, Alpha: shader.alpha ?? float(1) };
  }
  if (shader.kind === 'holdout') return { Color: vec3(0), Alpha: float(0) };
  const lit = ctx.litOutput(shader);
  if (lit) return { Color: lit.color, Alpha: lit.alpha };
  ctx.warn("Shader to RGB of a BSDF is approximated by the BSDF's base color");
  if (shader.kind === 'toon') return { Color: shader.color, Alpha: float(1) };
  return { Color: shader.baseColor, Alpha: shader.alpha };
};
