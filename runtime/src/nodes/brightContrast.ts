/**
 * Brightness/Contrast. Follows Cycles' svm_brightness_contrast (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors.
 */
import { float, max, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

export const brightContrast: NodeImpl = (ctx) => {
  const contrast = ctx.float('Contrast', 0);
  const a = float(1).add(contrast);
  const b = ctx.float('Bright', 0).sub(contrast.mul(0.5));
  return { Color: max(ctx.vec3('Color', [1, 1, 1]).mul(a).add(b), vec3(0)) };
};
