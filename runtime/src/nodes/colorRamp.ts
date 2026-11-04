/*
 * Color Ramp. Like Cycles' svm_node_rgb_ramp: a 256-entry table (ColorRamp.evaluate(i / 255),
 * sampled by the exporter) looked up without extrapolation, interpolated unless CONSTANT.
 */
import { vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { lookup, tableTexture } from './lut.js';

export const colorRamp: NodeImpl = (ctx) => {
  const ramp = ctx.node.data?.colorRamp;
  if (!ramp) {
    ctx.warn('missing color ramp data; re-export with the add-on');
    return { Color: vec3(0), Alpha: vec3(0).x };
  }
  const texture = tableTexture(ramp.lut, ramp.size, 4);
  const color = lookup(
    texture,
    ramp.size,
    ctx.float('Fac', 0.5),
    ramp.interpolation !== 'CONSTANT',
    false,
  );
  return { Color: color.xyz, Alpha: color.w };
};
