import type { Node } from 'three/webgpu';
import { dot, float, vec3 } from 'three/tsl';
import type { SocketType } from './types.js';

export type FloatNode = Node<'float'>;
export type Vec3Node = Node<'vec3'>;

/** Blender's default luminance coefficients (linear Rec.709), used for color -> float. */
export const LUMINANCE = vec3(0.2126729, 0.7151522, 0.072175);

export type SocketKind = 'float' | 'vec3' | 'shader' | 'other';

/**
 * How a Blender socket type is represented in TSL.
 * Colors are vec3: shading ignores socket alpha (nodes with an Alpha output expose it separately).
 */
export function socketKind(type: SocketType): SocketKind {
  switch (type) {
    case 'VALUE':
    case 'INT':
    case 'BOOLEAN':
      return 'float';
    case 'VECTOR':
    case 'RGBA':
    case 'ROTATION':
      return 'vec3';
    case 'SHADER':
      return 'shader';
    default:
      return 'other';
  }
}

/** Blender's implicit conversion of a linked value to a float input. */
export function toFloat(value: FloatNode | Vec3Node, from: SocketType): FloatNode {
  switch (socketKind(from)) {
    case 'float':
      return value as FloatNode;
    case 'vec3': {
      const v = value as Vec3Node;
      // Color -> float is luminance; vector -> float is the average of the components.
      return from === 'RGBA' ? dot(v, LUMINANCE) : v.x.add(v.y).add(v.z).div(3);
    }
    default:
      return float(0);
  }
}

/** Blender's implicit conversion of a linked value to a vector or color input. */
export function toVec3(value: FloatNode | Vec3Node, from: SocketType): Vec3Node {
  switch (socketKind(from)) {
    case 'float':
      return vec3(value as FloatNode);
    case 'vec3':
      return value as Vec3Node;
    default:
      return vec3(0);
  }
}

/** A constant for an unlinked socket value from the graph. */
export function constFloat(value: unknown, fallback = 0): FloatNode {
  if (typeof value === 'number') return float(value);
  if (typeof value === 'boolean') return float(value ? 1 : 0);
  if (Array.isArray(value) && typeof value[0] === 'number') return float(value[0]);
  return float(fallback);
}

export function constVec3(
  value: unknown,
  fallback: [number, number, number] = [0, 0, 0],
): Vec3Node {
  if (Array.isArray(value)) {
    const [x = 0, y = 0, z = 0] = value.map((v) => (typeof v === 'number' ? v : 0));
    return vec3(x, y, z);
  }
  if (typeof value === 'number') return vec3(value);
  return vec3(...fallback);
}
