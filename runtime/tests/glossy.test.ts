import {
  bsdfGraph,
  buildMaterial,
  describe,
  expect,
  it,
  MeshPhysicalNodeMaterial,
} from './bsdf.js';

describe('Glossy BSDF', () => {
  it('maps to a fully metallic physical material', () => {
    const { material, warnings } = buildMaterial(bsdfGraph('ShaderNodeBsdfAnisotropic'));
    expect(material).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect(warnings).toEqual([]);
  });
});
