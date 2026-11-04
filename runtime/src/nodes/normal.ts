/*
 * Normal node. Follows Cycles' svm_node_normal (Blender 5.2): Normal = the node's (normalised)
 * direction, Dot = dot(direction, normalize(input)). The direction is stored on the output socket.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { dot, normalize } from 'three/tsl';
import { constVec3 } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';

export const normal: NodeImpl = (ctx) => {
  const direction = normalize(constVec3(ctx.node.outputs?.Normal?.value, [0, 0, 1]));
  return { Normal: direction, Dot: dot(direction, normalize(ctx.vec3('Normal', [0, 0, 1]))) };
};
