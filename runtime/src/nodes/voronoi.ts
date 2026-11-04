/*
 * Voronoi Texture. Ported from Blender's gpu_shader_material_tex_voronoi.glsl and
 * gpu_shader_material_fractal_voronoi.glsl (Blender 5.2), which match Cycles' svm_node_tex_voronoi.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 */
import { clamp, float, int, select, vec3, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { FloatNode } from '../graph/convert.js';
import type { NodeContext, NodeImpl } from '../graph/evaluate.js';
import type { Dimensions } from './perlin.js';
import { textureVector } from './textureVector.js';
import {
  type Feature,
  type Metric,
  type VoronoiVariant,
  metricDistance,
  vecN,
  voronoiFeature,
  voronoiFractal,
} from './voronoiCore.js';

const DIMS: Record<string, Dimensions> = { '1D': 1, '2D': 2, '3D': 3, '4D': 4 };

/** Major version of the Blender that exported the graph (5 when unknown). */
export function blenderMajor(ctx: NodeContext): number {
  const match = /^(\d+)\./.exec(ctx.graph.generator?.blender ?? '');
  return match ? Number(match[1]) : 5;
}

export const voronoi: NodeImpl = (ctx) => {
  const dims = DIMS[ctx.prop<string>('voronoi_dimensions', '3D')] ?? 3;
  const feature = ctx.prop<Feature>('feature', 'F1');
  const metric = dims === 1 ? 'EUCLIDEAN' : ctx.prop<Metric>('distance', 'EUCLIDEAN');
  const normalize = ctx.prop<boolean>('normalize', false);
  const variant: VoronoiVariant = { dims, metric, legacy: blenderMajor(ctx) < 5 };

  const scale = ctx.float('Scale', 5);
  const randomness = clamp(ctx.float('Randomness', 1), 0, 1) as FloatNode;
  const exponent = ctx.float('Exponent', 0.5);
  const smoothness = clamp(ctx.float('Smoothness', 1).div(2), 0, 0.5) as FloatNode;

  const w = ctx.float('W').mul(scale) as FloatNode;
  const v = dims === 1 ? null : textureVector(ctx).mul(scale);
  const coord = vecN(v ? ([v.x, v.y, v.z, w] as FloatNode[]).slice(0, dims) : [w]);

  // Columns of the packed result (the typings lack element() on matrices).
  const columns = (m: Node<'mat3'>) => {
    const c = m as unknown as { element(i: Node<'int'>): Node<'vec3'> };
    return [c.element(int(0)), c.element(int(1)), c.element(int(2))] as const;
  };

  if (feature === 'N_SPHERE_RADIUS') {
    const fn = voronoiFeature(feature, variant)!;
    const radius = columns(fn(coord, randomness, exponent, smoothness))[0].x;
    return { Distance: float(0), Color: vec3(0), Position: vec3(0), W: float(0), Radius: radius };
  }

  const edge = feature === 'DISTANCE_TO_EDGE';
  const half = float(0.5).add(randomness.mul(0.5));
  let maxDistance: FloatNode =
    dims === 1 || edge
      ? half
      : metricDistance(
          variant,
          vecN(Array.from({ length: dims }, () => float(0))),
          vecN(Array.from({ length: dims }, () => half)),
          exponent,
        );
  if (feature === 'F2') maxDistance = maxDistance.mul(2);

  const fractal = voronoiFractal(feature, variant, normalize);
  const [c0, color, c2] = columns(
    fractal(
      coord,
      clamp(ctx.float('Detail', 0), 0, 15) as FloatNode,
      clamp(ctx.float('Roughness', 0.5), 0, 1) as FloatNode,
      ctx.float('Lacunarity', 2),
      randomness,
      exponent,
      smoothness,
      maxDistance,
    ),
  );
  const distance = c0.x;
  const position = vec4(c2, c0.y);

  // safe_divide(Position, scale)
  const scaled = select(scale.notEqual(0), position.div(scale), vec4(0)) as Node<'vec4'>;
  return {
    Distance: distance,
    Color: edge ? vec3(0) : color,
    Position: dims === 1 || edge ? vec3(0) : scaled.xyz,
    W: (dims === 1 || dims === 4) && !edge ? scaled.w : float(0),
    Radius: float(0),
  };
};
