/*
 * RGB Curves, Vector Curves, Float Curve. Follow Cycles' svm_node_curves /
 * svm_node_vector_curves / svm_node_float_curve (Blender 5.2): the input is mapped to the
 * table range, (x − min) / (max − min), looked up per channel with interpolation (and linear
 * extrapolation when the mapping extends EXTRAPOLATED), then mixed with the input by Fac.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeContext } from '../graph/evaluate.js';
import type { CurveMappingData } from '../graph/types.js';
import { lookup, tableTexture } from './lut.js';

export function curveTable(ctx: NodeContext, kind: 'RGB' | 'VECTOR' | 'FLOAT') {
  const data: CurveMappingData | undefined = ctx.node.data?.curveMapping;
  if (!data?.table || data.table.kind !== kind) {
    ctx.warn('missing curve table; re-export with the add-on');
    return null;
  }
  const { range, size, values } = data.table;
  const texture = tableTexture(values, size, kind === 'FLOAT' ? 1 : 3);
  const [lo, hi] = range;
  const extrapolate = data.extend === 'EXTRAPOLATED';
  const at = (x: FloatNode) => lookup(texture, size, x.sub(lo).div(hi - lo), true, extrapolate);
  return at;
}

export function curve3(ctx: NodeContext, kind: 'RGB' | 'VECTOR', input: Vec3Node): Vec3Node {
  const at = curveTable(ctx, kind);
  if (!at) return input;
  return vec3(at(input.x).x, at(input.y).y, at(input.z).z);
}
