/**
 * RGB to BW: luminance with Blender's default coefficients (linear Rec.709).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors.
 */
import { dot } from 'three/tsl';
import { LUMINANCE } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';

export const rgbToBW: NodeImpl = (ctx) => ({
  Val: dot(ctx.vec3('Color', [0.5, 0.5, 0.5]), LUMINANCE),
});
