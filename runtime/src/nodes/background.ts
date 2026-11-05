import type { NodeImpl } from '../graph/evaluate.js';

/** Background shader (World): color × strength, like an emission seen directly. */
export const background: NodeImpl = (ctx) => {
  const color = ctx.vec3('Color', [0.05, 0.05, 0.05]).mul(ctx.float('Strength', 1));
  return { Background: { kind: 'emission', color } };
};
