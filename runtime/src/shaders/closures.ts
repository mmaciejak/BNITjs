import type { FloatNode, Vec3Node } from '../graph/convert.js';

/**
 * A shader-socket value. Blender shaders become closures; the material builder maps the
 * closure that reaches the Material Output onto a three.js node material.
 */
export type Closure = PrincipledClosure | EmissionClosure;

export interface PrincipledClosure {
  kind: 'principled';
  baseColor: Vec3Node;
  metallic: FloatNode;
  roughness: FloatNode;
  alpha: FloatNode;
  /** Whether alpha can be below 1 (linked, or set below 1). */
  transparent: boolean;
  /** Emission color × strength. */
  emission: Vec3Node;
}

export interface EmissionClosure {
  kind: 'emission';
  /** Color × strength. */
  color: Vec3Node;
}

export function isClosure(value: unknown): value is Closure {
  return typeof value === 'object' && value !== null && 'kind' in value;
}
