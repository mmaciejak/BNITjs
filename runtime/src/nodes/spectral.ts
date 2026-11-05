/*
 * Blackbody and Wavelength: Cycles computes both colors from tables in its C++ code, so the runtime
 * interpolates tables measured from Cycles (spectra.ts, made by tools/measure_spectra.py), with the
 * constant colors Cycles returns outside the input range.
 */
import { select, vec3 } from 'three/tsl';
import type { DataTexture } from 'three/webgpu';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { lookup, tableTexture } from './lut.js';
import {
  BLACKBODY,
  BLACKBODY_HIGH,
  BLACKBODY_LOW,
  BLACKBODY_RANGE,
  WAVELENGTH,
  WAVELENGTH_HIGH,
  WAVELENGTH_LOW,
  WAVELENGTH_RANGE,
} from './spectra.js';

interface Table {
  values: Float32Array;
  range: readonly [number, number];
  low: readonly number[];
  high: readonly number[];
  texture?: DataTexture;
}

const TABLES: Record<'blackbody' | 'wavelength', Table> = {
  blackbody: {
    values: BLACKBODY,
    range: BLACKBODY_RANGE,
    low: BLACKBODY_LOW,
    high: BLACKBODY_HIGH,
  },
  wavelength: {
    values: WAVELENGTH,
    range: WAVELENGTH_RANGE,
    low: WAVELENGTH_LOW,
    high: WAVELENGTH_HIGH,
  },
};

function measured(table: Table, x: FloatNode): Vec3Node {
  const size = table.values.length / 3;
  // One texture per table, shared by every material.
  table.texture ??= tableTexture(Array.from(table.values), size, 3);
  const [lo, hi] = table.range;
  const inside = lookup(table.texture, size, x.sub(lo).div(hi - lo) as FloatNode, true, false).xyz;
  const [l0 = 0, l1 = 0, l2 = 0] = table.low;
  const [h0 = 0, h1 = 0, h2 = 0] = table.high;
  return select(
    x.lessThan(lo),
    vec3(l0, l1, l2),
    select(x.greaterThan(hi), vec3(h0, h1, h2), inside),
  ) as Vec3Node;
}

/** Blackbody: color of a black body at Temperature kelvin (scene-linear Rec.709). */
export const blackbody: NodeImpl = (ctx) => ({
  Color: measured(TABLES.blackbody, ctx.float('Temperature', 1500)),
});

/** Wavelength: color of light at Wavelength nanometers (black outside 380–780 nm). */
export const wavelength: NodeImpl = (ctx) => ({
  Color: measured(TABLES.wavelength, ctx.float('Wavelength', 500)),
});
