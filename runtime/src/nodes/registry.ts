import type { NodeImpl, NodeRegistry } from '../graph/evaluate.js';
import { bswValue } from './bswValue.js';
import { clamp } from './clamp.js';
import { brightContrast } from './brightContrast.js';
import { gamma } from './gamma.js';
import { invertColor } from './invert.js';
import { rgbToBW } from './rgbToBw.js';
import { mapRange } from './mapRange.js';
import { vectorRotate } from './vectorRotate.js';
import { emission } from './emission.js';
import { mapping } from './mapping.js';
import { math } from './math.js';
import { materialOutput } from './output.js';
import { principled } from './principled.js';
import { rgb } from './rgb.js';
import { texCoord } from './texCoord.js';
import { value } from './value.js';
import { vectorMath } from './vectorMath.js';
import { combineXYZ, separateXYZ } from './xyz.js';

/**
 * Blender node type (bl_idname) -> TSL implementation.
 *
 * Every type listed here must be ✅ or 🟡 in schema/node-support.json and vice versa
 * (tests/registry.test.ts checks it), so the README table matches the code.
 */
export const builtinNodes: Record<string, NodeImpl> = {
  BSW_Value: bswValue,
  ShaderNodeOutputMaterial: materialOutput,
  ShaderNodeEmission: emission,
  ShaderNodeMapping: mapping,
  ShaderNodeMath: math,
  ShaderNodeVectorMath: vectorMath,
  ShaderNodeClamp: clamp,
  ShaderNodeMapRange: mapRange,
  ShaderNodeVectorRotate: vectorRotate,
  ShaderNodeInvert: invertColor,
  ShaderNodeGamma: gamma,
  ShaderNodeBrightContrast: brightContrast,
  ShaderNodeRGBToBW: rgbToBW,
  ShaderNodeBsdfPrincipled: principled,
  ShaderNodeRGB: rgb,
  ShaderNodeTexCoord: texCoord,
  ShaderNodeValue: value,
  ShaderNodeSeparateXYZ: separateXYZ,
  ShaderNodeCombineXYZ: combineXYZ,
};

/** The built-in registry, optionally extended or overridden with custom node implementations. */
export function createRegistry(extra: Record<string, NodeImpl> = {}): NodeRegistry {
  return new Map(Object.entries({ ...builtinNodes, ...extra }));
}
