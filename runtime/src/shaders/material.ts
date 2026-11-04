import { vec3 } from 'three/tsl';
import { MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, type NodeMaterial } from 'three/webgpu';
import type { Closure } from './closures.js';

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
    const material = new MeshBasicNodeMaterial();
    material.colorNode = vec3(0);
    return material;
  }

  if (surface.kind === 'emission') {
    const material = new MeshBasicNodeMaterial();
    material.colorNode = surface.color;
    return material;
  }

  if (options.unlit) {
    const material = new MeshBasicNodeMaterial();
    material.colorNode = surface.baseColor;
    return material;
  }

  const material = new MeshPhysicalNodeMaterial();
  material.colorNode = surface.baseColor;
  material.metalnessNode = surface.metallic;
  material.roughnessNode = surface.roughness;
  material.emissiveNode = surface.emission;
  if (surface.specular) material.specularIntensityNode = surface.specular;
  if (surface.transparent) {
    material.transparent = true;
    material.opacityNode = surface.alpha;
  }
  return material;
}
