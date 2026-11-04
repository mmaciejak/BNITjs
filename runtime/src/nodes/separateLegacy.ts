import type { NodeImpl } from '../graph/evaluate.js';
import { rgbToHsv } from './color.js';

/** Legacy Separate RGB (Blender 4.2). */
export const separateRGB: NodeImpl = (ctx) => {
  const c = ctx.vec3('Image', [0.8, 0.8, 0.8]);
  return { R: c.x, G: c.y, B: c.z };
};

/** Legacy Separate HSV (Blender 4.2). */
export const separateHSV: NodeImpl = (ctx) => {
  const c = rgbToHsv(ctx.vec3('Color', [0.8, 0.8, 0.8]));
  return { H: c.x, S: c.y, V: c.z };
};
