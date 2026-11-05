/*
 * Gabor Texture (Blender 4.3+). Ported from Blender's gpu_shader_material_tex_gabor.glsl
 * (Blender 5.2), which matches Cycles' svm_node_tex_gabor.
 * SPDX-FileCopyrightText: 2011-2024 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 *
 * Sparse convolution noise: 8 random Gabor kernels per cell, summed over the 3^n neighbourhood
 * (72 kernels per pixel in 2D, 216 in 3D). Expensive; see the README's performance notes.
 */
import {
  Fn,
  If,
  Loop,
  acos,
  atan,
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  int,
  length,
  max,
  normalize,
  select,
  sign,
  sin,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { hashFloat3, hashFloat4, hashFloat4ToVec3 } from './hash.js';
import { textureVector } from './textureVector.js';

type F = FloatNode;
type V2 = Node<'vec2'>;
type V3 = Vec3Node;
type V4 = Node<'vec4'>;

const PI = Math.PI;
const IMPULSES = 8;

const hashVec3ToVec2 = (k: V3): V2 => vec2(hashFloat3(k), hashFloat3(k.zxy as V3)) as V2;
const hashVec4ToVec2 = (k: V4): V2 => vec2(hashFloat4(k), hashFloat4(k.zxwy as V4)) as V2;

/** Hann-windowed Gaussian times the phasor of a plane wave along frequencyVector. */
function kernel(position: V2 | V3, frequencyVector: V2 | V3): V2 {
  const d2 = dot(position as V3, position as V3);
  const window = float(0.5).add(cos(d2.mul(PI)).mul(0.5));
  const envelope = exp(d2.mul(-PI)).mul(window);
  const angle = dot(position as V3, frequencyVector as V3).mul(2 * PI);
  return vec2(cos(angle), sin(angle)).mul(envelope) as V2;
}

/** compute_2d_gabor_noise. */
const gabor2 = Fn(
  ([coords, frequency, isotropy, baseOrientation]: [V2, F, F, F]) => {
    const cell = floor(coords).toVar() as V2;
    const local = coords.sub(cell).toVar() as V2;
    const sum = vec2(0).toVar();
    const range = { start: int(-1), end: int(1), type: 'int', condition: '<=' } as const;
    Loop(range, range, ({ i: j, j: i }: { i: Node<'int'>; j: Node<'int'> }) => {
      const offset = vec2(i.toFloat(), j.toFloat());
      const current = cell.add(offset).toVar() as V2;
      const position = local.sub(offset).toVar() as V2;
      Loop(IMPULSES, ({ i: n }: { i: Node<'int'> }) => {
        const seed = n.mul(3).toFloat();
        const randomOrientation = hashFloat3(vec3(current, seed) as V3)
          .sub(0.5)
          .mul(PI);
        const orientation = baseOrientation.add(randomOrientation.mul(isotropy));
        const center = hashVec3ToVec2(vec3(current, seed.add(1)) as V3);
        const p = position.sub(center).toVar() as V2;
        If(dot(p, p).lessThan(1), () => {
          const weight = select(
            hashFloat3(vec3(current, seed.add(2)) as V3).lessThan(0.5),
            float(-1),
            float(1),
          );
          const fv = vec2(cos(orientation), sin(orientation)).mul(frequency) as V2;
          sum.addAssign(kernel(p, fv).mul(weight));
        });
      });
    });
    return sum;
  },
  {
    coords: 'vec2',
    frequency: 'float',
    isotropy: 'float',
    baseOrientation: 'float',
    return: 'vec2',
  },
) as unknown as (coords: V2, frequency: F, isotropy: F, orientation: F) => V2;

/** compute_3d_orientation: the base orientation randomly tilted by isotropy. */
function orientation3(base: V3, isotropy: F, seed: V4): V3 {
  const inclination = acos(base.z);
  const azimuth = sign(base.y).mul(acos(base.x.div(length(base.xy))));
  const r = hashVec4ToVec2(seed).mul(PI);
  const inc = inclination.add(r.x.mul(isotropy));
  const azi = azimuth.add(r.y.mul(isotropy));
  const tilted = vec3(sin(inc).mul(cos(azi)), sin(inc).mul(sin(azi)), cos(inc));
  return select(isotropy.equal(0), base, tilted) as V3;
}

/** compute_3d_gabor_noise. */
const gabor3 = Fn(
  ([coords, frequency, isotropy, baseOrientation]: [V3, F, F, V3]) => {
    const cell = floor(coords).toVar() as V3;
    const local = coords.sub(cell).toVar() as V3;
    const sum = vec2(0).toVar();
    const range = { start: int(-1), end: int(1), type: 'int', condition: '<=' } as const;
    (Loop as unknown as (...args: unknown[]) => void)(
      range,
      range,
      range,
      ({ i: k, j, k: i }: Record<string, Node<'int'>>) => {
        const offset = vec3(i!.toFloat(), j!.toFloat(), k!.toFloat());
        const current = cell.add(offset).toVar() as V3;
        const position = local.sub(offset).toVar() as V3;
        Loop(IMPULSES, ({ i: n }: { i: Node<'int'> }) => {
          const seed = n.mul(3).toFloat();
          const orientation = orientation3(baseOrientation, isotropy, vec4(current, seed) as V4);
          const center = hashFloat4ToVec3(vec4(current, seed.add(1)) as V4);
          const p = position.sub(center).toVar() as V3;
          If(dot(p, p).lessThan(1), () => {
            const weight = select(
              hashFloat4(vec4(current, seed.add(2)) as V4).lessThan(0.5),
              float(-1),
              float(1),
            );
            sum.addAssign(kernel(p, orientation.mul(frequency) as V3).mul(weight));
          });
        });
      },
    );
    return sum;
  },
  {
    coords: 'vec3',
    frequency: 'float',
    isotropy: 'float',
    baseOrientation: 'vec3',
    return: 'vec2',
  },
) as unknown as (coords: V3, frequency: F, isotropy: F, orientation: V3) => V2;

const SD_2D = Math.sqrt(IMPULSES * 0.5 * 0.25);
const SD_3D = Math.sqrt(IMPULSES * 0.5 * (1 / (4 * Math.SQRT2)));

export const gabor: NodeImpl = (ctx) => {
  const is3D = ctx.prop<string>('gabor_type', '2D') === '3D';
  const coords = textureVector(ctx).mul(ctx.float('Scale', 5));
  const isotropy = float(1).sub(clamp(ctx.float('Anisotropy', 1), 0, 1));
  const frequency = max(ctx.float('Frequency', 2), 0.001) as F;
  const phasor = is3D
    ? gabor3(coords, frequency, isotropy, normalize(ctx.vec3('Orientation 3D', [1, 0, 0])) as V3)
    : gabor2(coords.xy as V2, frequency, isotropy, ctx.float('Orientation 2D', PI / 4));
  const norm = 6 * (is3D ? SD_3D : SD_2D);
  return {
    Value: phasor.y.div(norm).mul(0.5).add(0.5),
    Phase: atan(phasor.y, phasor.x)
      .add(PI)
      .div(2 * PI),
    Intensity: length(phasor).div(norm),
  };
};
