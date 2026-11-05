import type { NodeImpl } from '../graph/evaluate.js';

/** World Output: exposes its Surface closure for the world builder. */
export const worldOutput: NodeImpl = (ctx) => {
  if (ctx.isLinked('Volume')) ctx.warn('Volume output is not supported');
  return { Surface: ctx.shader('Surface') };
};
