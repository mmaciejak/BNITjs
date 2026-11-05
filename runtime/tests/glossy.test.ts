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

  it('maps Anisotropy and Rotation to the physical anisotropy', () => {
    const graph = bsdfGraph('ShaderNodeBsdfAnisotropic');
    graph.nodes.B!.inputs!.Anisotropy = { name: 'Anisotropy', type: 'VALUE', value: 0.7 };
    graph.nodes.B!.inputs!.Rotation = { name: 'Rotation', type: 'VALUE', value: 0.25 };
    const { material, warnings } = buildMaterial(graph);
    expect((material as unknown as MeshPhysicalNodeMaterial).anisotropyNode).toBeTruthy();
    expect(warnings).toEqual([]);
  });

  it('leaves anisotropy off at 0', () => {
    const { material } = buildMaterial(bsdfGraph('ShaderNodeBsdfAnisotropic'));
    expect((material as unknown as MeshPhysicalNodeMaterial).anisotropyNode).toBeNull();
  });
});
