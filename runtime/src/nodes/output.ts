import type { NodeImpl } from '../graph/evaluate.js';

/** Material Output: exposes its Surface closure and Displacement (world offset) for the builder. */
export const materialOutput: NodeImpl = (ctx) => {
  if (ctx.isLinked('Volume')) ctx.warn('Volume output is not supported');
  return {
    Surface: ctx.shader('Surface'),
    Displacement: ctx.isLinked('Displacement') ? ctx.vec3('Displacement') : null,
  };
};
