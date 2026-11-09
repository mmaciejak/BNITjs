/*
 * Toon BSDF (diffuse component), mapped onto three.js's MeshToonNodeMaterial. Cycles'
 * bsdf_diffuse_toon_eval (Blender 5.2, kernel/closure/bsdf_toon.h) returns, for a light at angle θ
 * from the normal, intensity(θ) · ½ / (π (1 − cos θₛ)) without a cosine term, where intensity is 1
 * up to Size · π/2, falls linearly to 0 over Smooth · π/2, and θₛ = min(Size + Smooth, 1) · π/2.
 * three.js's toon model lights with gradientMap(N·L · 0.5 + 0.5) · color / π, so a gradient of
 * intensity(acos(2x − 1)) · ½ / (1 − cos θₛ) gives the same direct lighting. Size and Smooth are
 * baked into that gradient, so they must be constant; the Glossy component is rendered as Diffuse.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RedFormat } from 'three/webgpu';
import type { NodeImpl } from '../graph/evaluate.js';

const GRADIENT_SIZE = 256;

/** Cycles' bsdf_toon_get_intensity. */
function intensity(maxAngle: number, smooth: number, angle: number): number {
  if (angle < maxAngle) return 1;
  if (angle < maxAngle + smooth && smooth !== 0) return 1 - (angle - maxAngle) / smooth;
  return 0;
}

/** three.js gradient map reproducing Cycles' diffuse toon lobe for constant Size and Smooth. */
export function toonGradient(size: number, smooth: number): DataTexture {
  const maxAngle = Math.max(0, Math.min(1, size)) * (Math.PI / 2);
  const smoothAngle = Math.max(0, Math.min(1, smooth)) * (Math.PI / 2);
  const sampleAngle = Math.min(maxAngle + smoothAngle, Math.PI / 2);
  const norm = sampleAngle > 0 ? 0.5 / (1 - Math.cos(sampleAngle)) : 0;
  // Half floats: 32-bit float textures are not filterable everywhere (WebGPU's float32-filterable).
  const data = new Uint16Array(GRADIENT_SIZE);
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    const dotNL = ((i + 0.5) / GRADIENT_SIZE) * 2 - 1;
    const angle = Math.acos(Math.max(0, dotNL));
    data[i] = DataUtils.toHalfFloat(dotNL > 0 ? intensity(maxAngle, smoothAngle, angle) * norm : 0);
  }
  const texture = new DataTexture(data, GRADIENT_SIZE, 1, RedFormat, HalfFloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export const toon: NodeImpl = (ctx) => {
  if (ctx.prop<string>('component', 'DIFFUSE') !== 'DIFFUSE') {
    ctx.warn('the Glossy component is rendered as Diffuse');
  }
  for (const input of ['Size', 'Smooth']) {
    if (ctx.isLinked(input))
      ctx.warn(`a linked ${input} is not supported; using its default value`);
  }
  const size = Number(ctx.inputValue('Size') ?? 0.5);
  const smooth = Number(ctx.inputValue('Smooth') ?? 0);
  return {
    BSDF: {
      kind: 'toon',
      color: ctx.vec3('Color', [0.8, 0.8, 0.8]),
      gradient: toonGradient(size, smooth),
      ...(ctx.isLinked('Normal') ? { normal: ctx.vec3('Normal') } : {}),
    },
  };
};
