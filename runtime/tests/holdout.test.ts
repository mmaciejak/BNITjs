import { NoBlending } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { buildMaterial } from '../src/graph/build.js';
import type { ShaderGraph } from '../src/graph/types.js';

/** Material Output <- Holdout, optionally through a Mix Shader with an Emission. */
function holdoutGraph(mixed: boolean): ShaderGraph {
  const graph: ShaderGraph = {
    version: 1,
    generator: { name: 'test', version: '0', blender: '5.2.2' },
    material: 'm',
    output: 'Out',
    nodes: {
      Out: {
        type: 'ShaderNodeOutputMaterial',
        name: 'Out',
        inputs: { Surface: { name: 'Surface', type: 'SHADER' } },
      },
      H: {
        type: 'ShaderNodeHoldout',
        name: 'H',
        outputs: { Holdout: { name: 'Holdout', type: 'SHADER' } },
      },
    },
    links: [{ from: ['H', 'Holdout'], to: ['Out', 'Surface'] }],
  };
  if (mixed) {
    graph.nodes.E = {
      type: 'ShaderNodeEmission',
      name: 'E',
      inputs: { Color: { name: 'Color', type: 'RGBA', value: [1, 0, 0, 1] } },
      outputs: { Emission: { name: 'Emission', type: 'SHADER' } },
    };
    graph.nodes.Mix = {
      type: 'ShaderNodeMixShader',
      name: 'Mix',
      inputs: {
        Fac: { name: 'Fac', type: 'VALUE', value: 0.5 },
        Shader: { name: 'Shader', type: 'SHADER' },
        Shader_001: { name: 'Shader', type: 'SHADER' },
      },
      outputs: { Shader: { name: 'Shader', type: 'SHADER' } },
    };
    graph.links = [
      { from: ['H', 'Holdout'], to: ['Mix', 'Shader'] },
      { from: ['E', 'Emission'], to: ['Mix', 'Shader_001'] },
      { from: ['Mix', 'Shader'], to: ['Out', 'Surface'] },
    ];
  }
  return graph;
}

describe('Holdout', () => {
  it('writes transparent black without blending', () => {
    const { material, warnings } = buildMaterial(holdoutGraph(false));
    expect(material.blending).toBe(NoBlending);
    expect(material.opacityNode).toBeTruthy();
    expect(material.transparent).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('is rendered as Transparent when mixed', () => {
    const { material, warnings } = buildMaterial(holdoutGraph(true));
    expect(material.transparent).toBe(true);
    expect(warnings.join()).toContain('Holdout');
  });
});
