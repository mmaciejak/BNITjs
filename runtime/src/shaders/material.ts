import { cameraViewMatrix, cos, float, select, sin, vec2, vec3, vec4 } from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshToonNodeMaterial,
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

/** A normal in Blender's world axes → three.js view space (what normalNode expects). */
function toViewNormal(n: Vec3Node) {
  return cameraViewMatrix.mul(vec4(n.x, n.z, n.y.negate(), 0)).xyz.normalize();
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
    if (surface.alpha) {
      // Radiance R with opacity a: straight alpha blending draws (R / a)·a + background·(1 − a).
      // Exact when blending in linear space; approximate when blending onto an sRGB canvas.
      const a = surface.alpha;
      material.transparent = true;
      material.opacityNode = a;
      material.colorNode = select(a.greaterThan(1e-4), surface.color.div(a), surface.color);
    }
    return material;
  }

  if (surface.kind === 'toon') {
    if (options.unlit) {
      const material = new BlenderBasicNodeMaterial();
      material.colorNode = surface.color;
      return material;
    }
    const material = new MeshToonNodeMaterial();
    material.colorNode = surface.color;
    material.gradientMap = surface.gradient;
    if (surface.normal) material.normalNode = toViewNormal(surface.normal);
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
  if (surface.normal) material.normalNode = toViewNormal(surface.normal);
  if (surface.coat) {
    material.clearcoatNode = surface.coat.weight;
    material.clearcoatRoughnessNode = surface.coat.roughness;
    if (surface.coat.normal) material.clearcoatNormalNode = toViewNormal(surface.coat.normal);
  }
  if (surface.sheen) {
    material.sheenNode = surface.sheen.color;
    material.sheenRoughnessNode = surface.sheen.roughness;
  }
  if (surface.transmission) material.transmissionNode = surface.transmission;
  if (surface.ior) material.iorNode = surface.ior;
  if (surface.specularColor) material.specularColorNode = surface.specularColor;
  if (surface.thinFilm) {
    material.iridescenceNode = select(
      surface.thinFilm.thickness.greaterThan(0),
      float(1),
      float(0),
    );
    material.iridescenceThicknessNode = surface.thinFilm.thickness;
    material.iridescenceIORNode = surface.thinFilm.ior;
  }
  if (surface.anisotropy) {
    const { strength, rotation } = surface.anisotropy;
    material.anisotropyNode = vec2(cos(rotation), sin(rotation)).mul(strength);
  }
  if (surface.transparent) {
    material.transparent = true;
    material.opacityNode = surface.alpha;
  }
  return material;
}
