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
  /** Specular intensity multiplier (three.js specularIntensity); 0 for a pure diffuse BSDF. */
  specular?: FloatNode;
  /** Shading normal in Blender's world axes, when the Normal input is linked. */
  normal?: Vec3Node;
  /** Principled extras (Phase 8), each set only when it has a visible effect. */
  coat?: { weight: FloatNode; roughness: FloatNode; normal?: Vec3Node };
  /** Sheen color (Sheen Weight × Sheen Tint) and roughness. */
  sheen?: { color: Vec3Node; roughness: FloatNode };
  transmission?: FloatNode;
  ior?: FloatNode;
  specularColor?: Vec3Node;
  /** Thin film: thickness in nanometers and IOR. */
  thinFilm?: { thickness: FloatNode; ior: FloatNode };
  /** Anisotropy strength (0-1) and rotation (radians). */
  anisotropy?: { strength: FloatNode; rotation: FloatNode };
}

export interface EmissionClosure {
  kind: 'emission';
  /** Color × strength. */
  color: Vec3Node;
}

export function isClosure(value: unknown): value is Closure {
  return typeof value === 'object' && value !== null && 'kind' in value;
}
