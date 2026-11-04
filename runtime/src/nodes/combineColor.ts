import { vec3 } from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { hslToRgb, hsvToRgb } from './color.js';

function convert(mode: string, c: Vec3Node): Vec3Node {
  if (mode === 'HSV') return hsvToRgb(c);
  if (mode === 'HSL') return hslToRgb(c);
  return c;
}

/** Combine Color (RGB, HSV, HSL). */
export const combineColor: NodeImpl = (ctx) => ({
  Color: convert(
    ctx.prop<string>('mode', 'RGB'),
    vec3(ctx.float('Red'), ctx.float('Green'), ctx.float('Blue')),
  ),
});
