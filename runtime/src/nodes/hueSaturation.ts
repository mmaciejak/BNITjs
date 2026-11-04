/*
 * Hue/Saturation/Value. Follows Cycles' svm_node_hsv (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { fract, max, mix, saturate, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { hsvToRgb, rgbToHsv } from './color.js';

export const hueSaturation: NodeImpl = (ctx) => {
  const input = ctx.vec3('Color', [0.8, 0.8, 0.8]);
  const hsv = rgbToHsv(input);
  const adjusted = hsvToRgb(
    vec3(
      fract(hsv.x.add(ctx.float('Hue', 0.5)).add(0.5)),
      saturate(hsv.y.mul(ctx.float('Saturation', 1))),
      hsv.z.mul(ctx.float('Value', 1)),
    ),
  );
  // Clamp negatives caused by over-saturation, as Cycles does.
  return { Color: max(mix(input, adjusted, ctx.float('Fac', 1)), vec3(0)) };
};
