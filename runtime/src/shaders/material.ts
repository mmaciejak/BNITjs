import { cameraViewMatrix, vec3, vec4 } from 'three/tsl';
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  type Node,
  type NodeMaterial,
} from 'three/webgpu';
import type { Closure } from './closures.js';

/**
 * three.js's MeshBasicNodeMaterial always shades with the geometry normal. Blender's unlit
 * (Emission) materials still see a displaced (bump) normal through Geometry > Normal, so this one
 * uses normalNode when it is set.
 */
export class BlenderBasicNodeMaterial extends MeshBasicNodeMaterial {
  override setupNormal() {
    return this.normalNode ? vec3(this.normalNode as Node<'vec3'>) : super.setupNormal();
  }
}

export interface MaterialOptions {
  /**
   * Render the pattern only, without lighting: emission for Emission shaders, base color for
   * Principled. Used by the parity harness and handy for debugging.
   */
  unlit?: boolean;
}

/** Map the closure reaching the Material Output's Surface onto a three.js node material. */
export function materialFromClosure(
  surface: Closure | null,
  options: MaterialOptions = {},
): NodeMaterial {
  if (surface === null) {
    // Nothing linked to Surface: Blender renders black.
    const material = new BlenderBasicNodeMaterial();
    material.colorNode = vec3(0);
    return material;
  }

  if (surface.kind === 'emission') {
    const material = new BlenderBasicNodeMaterial();
    material.colorNode = surface.color;
    return material;
  }

  if (options.unlit) {
    const material = new BlenderBasicNodeMaterial();
    material.colorNode = surface.baseColor;
    return material;
  }

  const material = new MeshPhysicalNodeMaterial();
  material.colorNode = surface.baseColor;
  material.metalnessNode = surface.metallic;
  material.roughnessNode = surface.roughness;
  material.emissiveNode = surface.emission;
  if (surface.specular) material.specularIntensityNode = surface.specular;
  if (surface.normal) {
    // Blender world axes → three.js world (x, z, −y) → view space, which normalNode expects.
    const n = surface.normal;
    material.normalNode = cameraViewMatrix.mul(vec4(n.x, n.z, n.y.negate(), 0)).xyz.normalize();
  }
  if (surface.transparent) {
    material.transparent = true;
    material.opacityNode = surface.alpha;
  }
  return material;
}
