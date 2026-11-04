import { mix } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { curve3 } from './curveTable.js';

/** RGB Curves (see curveTable.ts). */
export const rgbCurves: NodeImpl = (ctx) => {
  const color = ctx.vec3('Color', [1, 1, 1]);
  return { Color: mix(color, curve3(ctx, 'RGB', color), ctx.float('Fac', 1)) };
};
