/*
 * Blackbody and Wavelength: Cycles computes both colors from tables in its C++ code, so the runtime
 * interpolates tables measured from Cycles (spectra.ts, made by tools/measure_spectra.py), with the
 * constant colors Cycles returns outside the input range.
 */
import { max, select, vec3 } from 'three/tsl';
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

/**
 * Wavelength: color of light at Wavelength nanometers. Cycles truncates its 5 nm table index
 * toward zero, so between 375 and 380 nm it extends the first segment (380–385 nm) linearly,
 * clamped at 0; below 375 nm and from 780 nm it is black.
 */
export const wavelength: NodeImpl = (ctx) => {
  const nm = ctx.float('Wavelength', 500);
  const table = TABLES.wavelength;
  const color = measured(table, nm);
  const step = (table.values.length / 3 - 1) / (table.range[1] - table.range[0]); // entries per nm
  const at = (i: number) =>
    vec3(table.values[i * 3] ?? 0, table.values[i * 3 + 1] ?? 0, table.values[i * 3 + 2] ?? 0);
  const first = at(0);
  const extended = max(
    first.add(
      at(Math.round(5 * step))
        .sub(first)
        .mul(nm.sub(380).div(5)),
    ),
    vec3(0),
  ) as Vec3Node;
  const inFirstSegment = nm.greaterThan(375).and(nm.lessThan(380));
  return { Color: select(inFirstSegment, extended, color) };
};
