/*
 * Light Path. A rasterizer only shades what the camera sees, so every shading point is hit by a
 * camera ray: Is Camera Ray is 1, the other ray types and all depths are 0, as for Cycles' camera
 * rays (svm_node_light_path, Blender 5.2). Ray Length is the camera ray's length. Cycles starts
 * camera rays on the near clip plane (camera_sample_perspective / _orthographic), so it is the
 * distance from there: |p| · (1 − near / z) with a perspective camera, z − near with an
 * orthographic one (p in camera space, z its depth).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import {
  cameraNear,
  cameraProjectionMatrix,
  float,
  length,
  positionView,
  select,
  vec4,
} from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

const ZERO_OUTPUTS = [
  'Is Shadow Ray',
  'Is Diffuse Ray',
  'Is Glossy Ray',
  'Is Singular Ray',
  'Is Reflection Ray',
  'Is Transmission Ray',
  'Is Volume Scatter Ray',
  'Ray Depth',
  'Diffuse Depth',
  'Glossy Depth',
  'Transparent Depth',
  'Transmission Depth',
  'Portal Depth',
];

export const lightPath: NodeImpl = () => {
  // (0, 0, −2, 1) projects to w = 2 with a perspective matrix (w = −z), w = 1 with an
  // orthographic one.
  const orthographic = cameraProjectionMatrix.mul(vec4(0, 0, -2, 1)).w.lessThan(1.5);
  const z = positionView.z.negate();
  const rayLength = select(
    orthographic,
    z.sub(cameraNear),
    length(positionView).mul(float(1).sub(cameraNear.div(z))),
  );
  return {
    'Is Camera Ray': float(1),
    'Ray Length': rayLength,
    ...Object.fromEntries(ZERO_OUTPUTS.map((name) => [name, float(0)])),
  };
};
