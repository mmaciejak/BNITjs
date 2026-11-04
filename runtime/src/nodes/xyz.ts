import type { NodeImpl } from '../graph/evaluate.js';

/** Separate XYZ. */
export const separateXYZ: NodeImpl = (ctx) => {
  const v = ctx.vec3('Vector');
  return { X: v.x, Y: v.y, Z: v.z };
};
