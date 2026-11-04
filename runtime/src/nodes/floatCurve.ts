import { mix } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { curveTable } from './curveTable.js';

/** Float Curve (see curveTable.ts). */
export const floatCurve: NodeImpl = (ctx) => {
  const value = ctx.float('Value', 1);
  const at = curveTable(ctx, 'FLOAT');
  const curved = at ? at(value).x : value;
  return { Value: mix(value, curved, ctx.float('Factor', 1)) };
};
