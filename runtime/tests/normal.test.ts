import type { MeshPhysicalNodeMaterial } from 'three/webgpu';
import type { ShaderGraph } from '../src/graph/types.js';
import { bsdfGraph, buildMaterial, describe, expect, it } from './bsdf.js';

/** <type> BSDF whose Normal comes from a Bump node fed by a Noise Texture. */
function bumped(type: string): ShaderGraph {
  const graph = bsdfGraph(type);
  graph.nodes.B!.inputs!.Normal = { name: 'Normal', type: 'VECTOR', value: [0, 0, 0] };
  graph.nodes.Noise = {
    type: 'ShaderNodeTexNoise',
    name: 'Noise',
    outputs: { Fac: { name: 'Fac', type: 'VALUE' } },
  };
  graph.nodes.Bump = {
    type: 'ShaderNodeBump',
    name: 'Bump',
    inputs: { Height: { name: 'Height', type: 'VALUE', value: 1 } },
    outputs: { Normal: { name: 'Normal', type: 'VECTOR' } },
  };
  graph.links!.push(
    { from: ['Noise', 'Fac'], to: ['Bump', 'Height'] },
    { from: ['Bump', 'Normal'], to: ['B', 'Normal'] },
  );
  return graph;
}

describe('shading normal', () => {
  for (const type of [
    'ShaderNodeBsdfPrincipled',
    'ShaderNodeBsdfDiffuse',
    'ShaderNodeBsdfAnisotropic',
  ]) {
    it(`a linked Normal sets normalNode (${type})`, () => {
      const { material, warnings } = buildMaterial(bumped(type));
      expect((material as unknown as MeshPhysicalNodeMaterial).normalNode).toBeTruthy();
      expect(warnings.join()).not.toMatch(/Normal/);
    });
  }

  it('an unlinked Normal leaves the geometry normal', () => {
    const { material } = buildMaterial(bsdfGraph('ShaderNodeBsdfPrincipled'));
    expect((material as unknown as MeshPhysicalNodeMaterial).normalNode).toBeNull();
  });
});
