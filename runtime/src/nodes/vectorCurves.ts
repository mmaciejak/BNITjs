import { mix } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { curve3 } from './curveTable.js';

/** Vector Curves (see curveTable.ts). */
export const vectorCurves: NodeImpl = (ctx) => {
  const vector = ctx.vec3('Vector');
  return { Vector: mix(vector, curve3(ctx, 'VECTOR', vector), ctx.float('Fac', 1)) };
};
