import { constFloat, constVec3, socketKind } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';

/** Constant produced by the exporter's flattening (unlinked group inputs, muted outputs). */
export const bswValue: NodeImpl = (ctx) => {
  const type = ctx.node.outputs?.Value?.type ?? 'VALUE';
  const value = ctx.prop<unknown>('value', 0);
  const kind = socketKind(type);
  const param = ctx.param();
  if (param) return { Value: param };
  return {
    Value: kind === 'vec3' ? constVec3(value) : kind === 'float' ? constFloat(value) : null,
  };
};
