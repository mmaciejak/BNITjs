import type { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { bsdfGraph, buildMaterial, describe, expect, it } from './bsdf.js';

const physical = (type: string) => {
  const { material, warnings } = buildMaterial(bsdfGraph(type));
  return { m: material as unknown as MeshPhysicalNodeMaterial, warnings };
};

describe('hard-tier BSDFs (Phase 10)', () => {
  it('Sheen BSDF is a sheen layer over a black, non-specular base', () => {
    const { m, warnings } = physical('ShaderNodeBsdfSheen');
    expect(warnings).toEqual([]);
    expect(m.sheenNode).toBeTruthy();
    expect(m.sheenRoughnessNode).toBeTruthy();
    expect(m.specularIntensityNode).toBeTruthy();
  });

  it('Translucent BSDF is a diffuse surface with the normal reversed', () => {
    const { m, warnings } = physical('ShaderNodeBsdfTranslucent');
    expect(warnings).toEqual([]);
    expect(m.normalNode).toBeTruthy();
    expect(m.specularIntensityNode).toBeTruthy();
    expect(m.sheenNode).toBeNull();
  });

  it('Subsurface Scattering is a diffuse surface and says so', () => {
    const graph = bsdfGraph('ShaderNodeSubsurfaceScattering');
    graph.nodes.B!.outputs = { BSSRDF: { name: 'BSSRDF', type: 'SHADER' } };
    graph.links = [{ from: ['B', 'BSSRDF'], to: ['Out', 'Surface'] }];
    const { material, warnings } = buildMaterial(graph);
    const m = material as unknown as MeshPhysicalNodeMaterial;
    expect(m.specularIntensityNode).toBeTruthy();
    expect(warnings.join()).toContain('diffuse');
  });
});
