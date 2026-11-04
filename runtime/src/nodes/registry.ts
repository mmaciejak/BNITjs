import type { NodeImpl, NodeRegistry } from '../graph/evaluate.js';
import { bswValue } from './bswValue.js';
import { emission } from './emission.js';
import { materialOutput } from './output.js';
import { rgb } from './rgb.js';

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
  ShaderNodeRGB: rgb,
};

/** The built-in registry, optionally extended or overridden with custom node implementations. */
export function createRegistry(extra: Record<string, NodeImpl> = {}): NodeRegistry {
  return new Map(Object.entries({ ...builtinNodes, ...extra }));
}
