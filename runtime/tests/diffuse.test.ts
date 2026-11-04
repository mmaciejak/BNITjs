import {
  bsdfGraph,
  buildMaterial,
  describe,
  expect,
  it,
  MeshPhysicalNodeMaterial,
} from './bsdf.js';

describe('Diffuse BSDF', () => {
  it('turns specular off and reports roughness', () => {
    const { material, warnings } = buildMaterial(bsdfGraph('ShaderNodeBsdfDiffuse'));
    expect(material).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect((material as MeshPhysicalNodeMaterial).specularIntensityNode).toBeTruthy();
    expect(warnings.join()).toContain('Oren-Nayar');
  });
});
