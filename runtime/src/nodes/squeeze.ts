/**
 * Squeeze Value (legacy): 1 / (1 + e^(−(value − center)·width)), as in Blender's GLSL (EEVEE).
 * Cycles does not implement this node.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors.
 */
import { exp, float } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

export const squeeze: NodeImpl = (ctx) => {
  const value = ctx.float('Value', 0);
  const width = ctx.float('Width', 1);
  const center = ctx.float('Center', 0);
  return { Value: float(1).div(float(1).add(exp(value.sub(center).mul(width).negate()))) };
};
