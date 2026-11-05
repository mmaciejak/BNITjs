import type { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { bsdfGraph, buildMaterial, describe, expect, it } from './bsdf.js';

const physical = (type: string) => {
  const { material, warnings } = buildMaterial(bsdfGraph(type));
  return { m: material as unknown as MeshPhysicalNodeMaterial, warnings };
};

describe('BSDFs mapped to the physical material', () => {
  it('Glass is fully transmissive with an IOR', () => {
    const { m } = physical('ShaderNodeBsdfGlass');
    expect(m.transmissionNode).toBeTruthy();
    expect(m.iorNode).toBeTruthy();
  });

  it('Refraction transmits without specular reflection', () => {
    const { m } = physical('ShaderNodeBsdfRefraction');
    expect(m.transmissionNode).toBeTruthy();
    expect(m.specularIntensityNode).toBeTruthy();
  });

  it('Metallic is a metal', () => {
    const { m } = physical('ShaderNodeBsdfMetallic');
    expect(m.metalnessNode).toBeTruthy();
    expect(m.transmissionNode).toBeNull();
  });

  it('Specular (EEVEE) sets a specular color and says it is EEVEE-only', () => {
    const { m, warnings } = physical('ShaderNodeEeveeSpecular');
    expect(m.specularColorNode).toBeTruthy();
    expect(warnings.join()).toContain('EEVEE');
  });
});
