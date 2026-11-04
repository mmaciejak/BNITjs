import type { NodeImpl } from '../graph/evaluate.js';

/** Material Output: exposes its Surface closure for the material builder. */
export const materialOutput: NodeImpl = (ctx) => {
  if (ctx.isLinked('Volume')) ctx.warn('Volume output is not supported');
  if (ctx.isLinked('Displacement')) ctx.warn('Displacement is not supported yet (Phase 7)');
  return { Surface: ctx.shader('Surface') };
};
