/*
 * Normal Map. Follows Cycles' svm_node_normal_map and Blender's gpu_shader_material_normal_map.glsl
 * (Blender 5.2): in tangent space Strength scales the map itself; in the other spaces it blends
 * the mapped normal with the shading normal. Tangent space
 * uses a tangent frame from screen-space derivatives of the position and the UV map instead of
 * MikkTSpace tangents (glTF files carry tangents only when exported with them): exact for flat,
 * uniformly mapped surfaces, close on curved ones.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import {
  cross,
  dFdx,
  dFdy,
  dot,
  float,
  frontFacing,
  max,
  mix,
  modelNormalMatrix,
  positionWorld,
  saturate,
  select,
  vec3,
} from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { blenderUV, shadingNormalBlender, toBlender } from './space.js';

/** Blender object-space direction → Blender world axes. */
function objectToWorld(d: Vec3Node): Vec3Node {
  return toBlender(modelNormalMatrix.mul(vec3(d.x, d.z, d.y.negate())));
}

export const normalMap: NodeImpl = (ctx) => {
  const space = ctx.prop<string>('space', 'TANGENT');
  const n = shadingNormalBlender().normalize().toVar() as Vec3Node;
  const c = ctx.vec3('Color', [0.5, 0.5, 1]).sub(0.5).mul(2).toVar() as Vec3Node;

  const strength = max(ctx.float('Strength', 1), 0) as FloatNode;
  let mapped: Vec3Node;
  if (space === 'TANGENT') {
    const names = ctx.graph.uvMaps?.names ?? [];
    const uvName = ctx.prop<string>('uv_map', '');
    const index = uvName
      ? Math.max(names.indexOf(uvName), 0)
      : (ctx.graph.uvMaps?.activeRender ?? 0);
    if (uvName && !names.includes(uvName))
      ctx.warn(`UV map "${uvName}" not found; using the active one`);
    const uv = blenderUV(index);
    const p = toBlender(positionWorld);
    const dp1 = dFdx(p);
    const dp2 = dFdy(p);
    const duv1 = dFdx(uv);
    const duv2 = dFdy(uv);
    const dp2perp = cross(dp2, n);
    const dp1perp = cross(n, dp1);
    const t = dp2perp.mul(duv1.x).add(dp1perp.mul(duv2.x)).toVar() as Vec3Node;
    const b = dp2perp.mul(duv1.y).add(dp1perp.mul(duv2.y));
    // MikkTSpace-like frame: unit tangent ⟂ N, bitangent = sign · N × T.
    const tangent = t
      .sub(n.mul(dot(n, t)))
      .normalize()
      .toVar() as Vec3Node;
    const s = select(dot(cross(n, tangent), b).lessThan(0), float(-1), float(1));
    const bitangent = cross(n, tangent).mul(s);
    // Strength scales the map's xy and blends its z towards 1 (inside tangent space).
    const xy = c.xy.mul(strength);
    const z = mix(float(1), c.z, saturate(strength));
    const mappedTangent = tangent.mul(xy.x).add(bitangent.mul(xy.y)).add(n.mul(z)).normalize();
    return { Normal: select(frontFacing, mappedTangent, mappedTangent.negate()) };
  } else {
    let col = c;
    if (space === 'BLENDER_OBJECT' || space === 'BLENDER_WORLD')
      col = vec3(c.x, c.y.negate(), c.z.negate());
    mapped = (
      space === 'OBJECT' || space === 'BLENDER_OBJECT' ? objectToWorld(col) : col
    ).normalize() as Vec3Node;
  }
  // Inverted on back faces, then blended with the shading normal by Strength.
  const facing = select(frontFacing, mapped, mapped.negate()) as Vec3Node;
  return { Normal: mix(n, facing, strength).normalize() };
};
