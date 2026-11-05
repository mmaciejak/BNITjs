/*
 * Wireframe. Follows Cycles' svm_wireframe (Blender 5.2): 1 within half of Size from any triangle
 * edge (Size in world units, or in pixels when Pixel Size is on), else 0.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 *
 * The loader gives meshes that use this node a per-triangle barycentric attribute (see
 * loader/plugin.ts). The distance to the edge opposite vertex k is b_k / |∇b_k|, with the surface
 * gradient from screen-space derivatives, as in the Bump node.
 */
import {
  attribute,
  cross,
  dFdx,
  dFdy,
  dot,
  float,
  length,
  max,
  positionWorld,
  select,
} from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { toBlender, viewDirBlender } from './space.js';

/** Name of the barycentric attribute the loader adds. */
export const BARYCENTRIC_ATTRIBUTE = 'bswBarycentric';

export const wireframe: NodeImpl = (ctx) => {
  const b = attribute(BARYCENTRIC_ATTRIBUTE, 'vec3') as unknown as Vec3Node;
  const p = toBlender(positionWorld);
  const dPdx = dFdx(p).toVar() as Vec3Node;
  const dPdy = dFdy(p).toVar() as Vec3Node;
  const ng = cross(dPdx, dPdy).normalize().toVar() as Vec3Node;
  const rx = cross(dPdy, ng);
  const ry = cross(ng, dPdx);
  const det = dot(dPdx, rx).toVar() as FloatNode;
  const dbx = dFdx(b);
  const dby = dFdy(b);
  const distance = (k: 'x' | 'y' | 'z') => {
    const grad = rx.mul(dbx[k]).add(ry.mul(dby[k])).div(det);
    return b[k].div(max(length(grad), 1e-12));
  };
  const size = ctx.float('Size', 0.01);
  let width: FloatNode = size.mul(0.5) as FloatNode;
  if (ctx.prop<boolean>('use_pixel_size', false)) {
    // Pixel footprint: the position derivatives projected onto the view plane, averaged.
    const wi = viewDirBlender();
    const px = length(dPdx.sub(wi.mul(dot(dPdx, wi))));
    const py = length(dPdy.sub(wi.mul(dot(dPdy, wi))));
    width = px.add(py).mul(0.5).mul(width) as FloatNode;
  }
  const nearest = distance('x').min(distance('y')).min(distance('z'));
  return { Fac: select(nearest.lessThan(width), float(1), float(0)) };
};
