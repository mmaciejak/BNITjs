import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { rgbToHsl, rgbToHsv } from './color.js';

function convert(mode: string, color: Vec3Node): Vec3Node {
  if (mode === 'HSV') return rgbToHsv(color);
  if (mode === 'HSL') return rgbToHsl(color);
  return color;
}

/** Separate Color (RGB, HSV, HSL). */
export const separateColor: NodeImpl = (ctx) => {
  const c = convert(ctx.prop<string>('mode', 'RGB'), ctx.vec3('Color', [0.8, 0.8, 0.8]));
  return { Red: c.x, Green: c.y, Blue: c.z };
};
