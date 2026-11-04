import { constFloat } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';

/** Value: the value lives on the output socket. */
export const value: NodeImpl = (ctx) => ({
  Value: constFloat(ctx.node.outputs?.Value?.value, 0.5),
});
