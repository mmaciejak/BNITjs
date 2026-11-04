import type { NodeImpl } from '../graph/evaluate.js';

/** Emission shader: color × strength, unlit. */
export const emission: NodeImpl = (ctx) => {
  const color = ctx.vec3('Color', [1, 1, 1]).mul(ctx.float('Strength', 1));
  return { Emission: { kind: 'emission', color } };
};
