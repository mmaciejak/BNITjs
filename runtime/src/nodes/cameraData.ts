/*
 * Camera Data. Follows Cycles' svm_node_camera (Blender 5.2): the shading point in camera
 * space (+Z in front of the camera); View Vector is it normalised, View Z Depth its z, View
 * Distance its length.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { length, normalize, positionView, vec3 } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';

export const cameraData: NodeImpl = () => {
  const p = vec3(positionView.x, positionView.y, positionView.z.negate());
  return { 'View Vector': normalize(p), 'View Z Depth': p.z, 'View Distance': length(p) };
};
