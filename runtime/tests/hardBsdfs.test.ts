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
});
