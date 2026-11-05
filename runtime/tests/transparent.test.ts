import type { MeshBasicNodeMaterial } from 'three/webgpu';
import type { ShaderGraph } from '../src/graph/types.js';
import { bsdfGraph, buildMaterial, describe, expect, it } from './bsdf.js';

/** Mix Shader(Fac 0.3, Transparent, Emission). */
function mixed(): ShaderGraph {
  const graph = bsdfGraph('ShaderNodeBsdfTransparent');
  graph.nodes.E = {
    type: 'ShaderNodeEmission',
    name: 'E',
    outputs: { Emission: { name: 'Emission', type: 'SHADER' } },
  };
  graph.nodes.M = {
    type: 'ShaderNodeMixShader',
    name: 'M',
    inputs: { Fac: { name: 'Fac', type: 'VALUE', value: 0.3 } },
    outputs: { Shader: { name: 'Shader', type: 'SHADER' } },
  };
  graph.links = [
    { from: ['B', 'BSDF'], to: ['M', 'Shader'] },
    { from: ['E', 'Emission'], to: ['M', 'Shader_001'] },
    { from: ['M', 'Shader'], to: ['Out', 'Surface'] },
  ];
  return graph;
}

describe('Transparent BSDF', () => {
  it('alone is fully transparent', () => {
    const { material } = buildMaterial(bsdfGraph('ShaderNodeBsdfTransparent'));
    expect(material.transparent).toBe(true);
    expect((material as unknown as MeshBasicNodeMaterial).opacityNode).toBeTruthy();
  });

  it('mixed with an emission gives a partly transparent emission', () => {
    const { material, warnings } = buildMaterial(mixed());
    expect(material.transparent).toBe(true);
    expect(warnings.join()).toContain('untinted'); // bsdfGraph gives it a colored Color
  });
});
