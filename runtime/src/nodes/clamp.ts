import { clamp as clampTo, max, min } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

/**
 * Clamp: MINMAX clamps to [min, max]; RANGE also accepts min > max (Cycles svm_clamp).
 * RANGE is written with min()/max() rather than select(): with constant bounds, a clamp() with
 * low > high in either branch is a WGSL shader-creation error.
 */
export const clamp: NodeImpl = (ctx) => {
  const value = ctx.float('Value', 1);
  const lo = ctx.float('Min', 0);
  const hi = ctx.float('Max', 1);
  const result =
    ctx.prop<string>('clamp_type', 'MINMAX') === 'RANGE'
      ? clampTo(value, min(lo, hi), max(lo, hi))
      : clampTo(value, lo, hi);
  return { Result: result };
};
