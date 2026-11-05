import { float, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { addClosures, mixClosures } from '../shaders/combine.js';

/** Mix Shader: Fac blends the first Shader input into the second. */
export const mixShader: NodeImpl = (ctx) => ({
  Shader: mixClosures(ctx.shader('Shader'), ctx.shader('Shader_001'), ctx.float('Fac', 0.5)),
});

/** Add Shader. */
export const addShader: NodeImpl = (ctx) => ({
  Shader: addClosures(ctx.shader('Shader'), ctx.shader('Shader_001'), (m) => ctx.warn(m)),
});

/** Transparent BSDF: lets the background through; a non-white Color tints it (approximated). */
export const transparent: NodeImpl = (ctx) => {
  const color = ctx.inputValue('Color');
  if (ctx.isLinked('Color') || (Array.isArray(color) && color.slice(0, 3).some((c) => c !== 1))) {
    ctx.warn('a tinted Transparent BSDF is rendered untinted');
  }
  return { BSDF: { kind: 'emission', color: vec3(0), alpha: float(0) } };
};
