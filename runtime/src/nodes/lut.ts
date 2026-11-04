/*
 * Lookup tables for Color Ramp and the curve nodes (257 entries at i / 256, Cycles' RAMP_TABLE_SIZE).
 *
 * Tables are float DataTextures read with textureLoad (texel fetch, no filtering), so lookups are
 * exact on every backend. lookup() follows Cycles' rgb_ramp_lookup in
 * intern/cycles/kernel/svm/ramp.h (Blender 5.2):
 *   f outside [0, 1] and extrapolate: linear extension from the two end entries;
 *   otherwise i = int(clamp(f, 0, 1)·(size − 1)), interpolated with entry i + 1 unless disabled.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { clamp, float, floor, int, ivec2, min, mix, select, textureLoad } from 'three/tsl';
import { DataTexture, FloatType, NearestFilter, RGBAFormat, type Node } from 'three/webgpu';
import type { FloatNode } from '../graph/convert.js';

export type Vec4Node = Node<'vec4'>;

/** A size×1 RGBA float texture from `channels`-wide entries (missing channels are 0, alpha 1). */
export function tableTexture(values: number[], size: number, channels: number): DataTexture {
  const data = new Float32Array(size * 4);
  for (let i = 0; i < size; i++) {
    for (let c = 0; c < 4; c++) {
      data[i * 4 + c] = c < channels ? (values[i * channels + c] ?? 0) : c === 3 ? 1 : 0;
    }
  }
  const texture = new DataTexture(data, size, 1, RGBAFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Cycles' rgb_ramp_lookup. */
export function lookup(
  texture: DataTexture,
  size: number,
  f: FloatNode,
  interpolate: boolean,
  extrapolate: boolean,
): Vec4Node {
  const fetch = (i: Node<'int'>) => textureLoad(texture, ivec2(i, int(0))) as unknown as Vec4Node;
  const n1 = float(size - 1);
  const g = clamp(f, 0, 1).mul(n1);
  const i = min(floor(g), n1);
  const entry = fetch(int(i));
  let value: Vec4Node = entry;
  if (interpolate) {
    const next = fetch(int(min(i.add(1), n1)));
    value = mix(entry, next, g.sub(i));
  }
  if (!extrapolate) return value;
  const first = fetch(int(0));
  const last = fetch(int(size - 1));
  const below = first.add(first.sub(fetch(int(1))).mul(f.negate().mul(n1)));
  const above = last.add(last.sub(fetch(int(size - 2))).mul(f.sub(1).mul(n1)));
  return select(f.lessThan(0), below, select(f.greaterThan(1), above, value));
}
