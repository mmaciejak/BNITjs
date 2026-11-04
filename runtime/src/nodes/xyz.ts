import { vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

/** Separate XYZ. */
export const separateXYZ: NodeImpl = (ctx) => {
  const v = ctx.vec3('Vector');
  return { X: v.x, Y: v.y, Z: v.z };
};

/** Combine XYZ. */
export const combineXYZ: NodeImpl = (ctx) => ({
  Vector: vec3(ctx.float('X'), ctx.float('Y'), ctx.float('Z')),
});
