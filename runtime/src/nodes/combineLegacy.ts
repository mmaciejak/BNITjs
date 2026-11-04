import { vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { hsvToRgb } from './color.js';

/** Legacy Combine RGB (Blender 4.2). */
export const combineRGB: NodeImpl = (ctx) => ({
  Image: vec3(ctx.float('R'), ctx.float('G'), ctx.float('B')),
});

/** Legacy Combine HSV (Blender 4.2). */
export const combineHSV: NodeImpl = (ctx) => ({
  Color: hsvToRgb(vec3(ctx.float('H'), ctx.float('S'), ctx.float('V'))),
});
