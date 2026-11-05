/*
 * Vector Transform. Follows Cycles' svm_node_vector_transform (Blender 5.2): points, vectors and
 * normals between World, Object and Camera space. Camera space has +Z in front of the camera (as
 * Texture Coordinate > Camera); normals use the inverse transpose and are normalised.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import {
  cameraViewMatrix,
  cameraWorldMatrix,
  modelNormalMatrix,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  transpose,
  vec3,
  vec4,
} from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { toBlender } from './space.js';

type Kind = 'POINT' | 'VECTOR' | 'NORMAL';

/** Blender axes → glTF / three.js axes. */
const fromBlender = (v: Vec3Node): Vec3Node => vec3(v.x, v.z, v.y.negate());
const w = (kind: Kind) => (kind === 'POINT' ? 1 : 0);

/** A value in `space` (Blender conventions) → three.js world space. */
function toWorld(v: Vec3Node, space: string, kind: Kind): Vec3Node {
  if (space === 'OBJECT') {
    const local = fromBlender(v);
    if (kind === 'NORMAL') return modelNormalMatrix.mul(local) as Vec3Node;
    return modelWorldMatrix.mul(vec4(local, w(kind))).xyz as Vec3Node;
  }
  if (space === 'CAMERA') {
    // Cycles' camera space looks along +Z; three.js view space along −Z.
    return cameraWorldMatrix.mul(vec4(v.x, v.y, v.z.negate(), w(kind))).xyz as Vec3Node;
  }
  return fromBlender(v);
}

/** three.js world space → `space` (Blender conventions). */
function fromWorld(v: Vec3Node, space: string, kind: Kind): Vec3Node {
  if (space === 'OBJECT') {
    const local =
      kind === 'NORMAL'
        ? (transpose(modelWorldMatrix).mul(vec4(v, 0)).xyz as Vec3Node) // Mᵀ·n (w = 0 drops translation)
        : (modelWorldMatrixInverse.mul(vec4(v, w(kind))).xyz as Vec3Node);
    return toBlender(local);
  }
  if (space === 'CAMERA') {
    const view = cameraViewMatrix.mul(vec4(v, w(kind))).xyz;
    return vec3(view.x, view.y, view.z.negate());
  }
  return toBlender(v);
}

export const vectorTransform: NodeImpl = (ctx) => {
  const kind = ctx.prop<Kind>('vector_type', 'VECTOR');
  const from = ctx.prop<string>('convert_from', 'WORLD');
  const to = ctx.prop<string>('convert_to', 'OBJECT');
  const v = ctx.vec3('Vector', [0.5, 0.5, 0.5]);
  if (from === to) return { Vector: kind === 'NORMAL' ? v.normalize() : v };
  const out = fromWorld(toWorld(v, from, kind), to, kind);
  return { Vector: kind === 'NORMAL' ? out.normalize() : out };
};
