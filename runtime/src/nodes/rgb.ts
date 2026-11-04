import { constVec3 } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';

/** Color (named "RGB" before Blender 5.0): the value lives on the output socket. */
export const rgb: NodeImpl = (ctx) => ({
  Color: constVec3(ctx.node.outputs?.Color?.value, [0.5, 0.5, 0.5]),
});
