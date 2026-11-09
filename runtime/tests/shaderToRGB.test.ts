import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { buildMaterial } from '../src/graph/build.js';
import type { GraphNode, ShaderGraph } from '../src/graph/types.js';

const shader = (type: string, output: string): GraphNode => ({
  type,
  name: type,
  inputs: { Color: { name: 'Color', type: 'RGBA', value: [0.2, 0.4, 0.6, 1] } },
  outputs: { [output]: { name: output, type: 'SHADER' } },
});

/** <source> → Shader to RGB → Color of <sink> → Material Output. */
function graph(source: 'emission' | 'diffuse', sink: 'emission' | 'principled'): ShaderGraph {
  const src =
    source === 'emission'
      ? shader('ShaderNodeEmission', 'Emission')
      : shader('ShaderNodeBsdfDiffuse', 'BSDF');
  const out =
    sink === 'emission'
      ? shader('ShaderNodeEmission', 'Emission')
      : {
          ...shader('ShaderNodeBsdfPrincipled', 'BSDF'),
          inputs: { 'Base Color': { name: 'Base Color', type: 'RGBA' as const } },
        };
  const sinkInput = sink === 'emission' ? 'Color' : 'Base Color';
  return {
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
      Src: src,
      S2R: {
        type: 'ShaderNodeShaderToRGB',
        name: 'S2R',
        inputs: { Shader: { name: 'Shader', type: 'SHADER' } },
        outputs: {
          Color: { name: 'Color', type: 'RGBA' },
          Alpha: { name: 'Alpha', type: 'VALUE' },
        },
      },
      Sink: out,
    },
    links: [
      { from: ['Src', Object.keys(src.outputs!)[0]!], to: ['S2R', 'Shader'] },
      { from: ['S2R', 'Color'], to: ['Sink', sinkInput] },
      { from: ['Sink', Object.keys(out.outputs!)[0]!], to: ['Out', 'Surface'] },
    ],
  };
}

describe('Shader to RGB', () => {
  it('passes an Emission through exactly', () => {
    const { material, warnings } = buildMaterial(graph('emission', 'emission'));
    expect(warnings).toEqual([]);
    expect(material.outputNode).toBeNull();
  });

  it("lights a BSDF and outputs the Surface's emission of it (the toon setup)", () => {
    const { material, warnings } = buildMaterial(graph('diffuse', 'emission'));
    expect(warnings).toEqual([]);
    expect(material).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect(material.outputNode).toBeTruthy();
  });

  it("falls back to the BSDF's base color when the lit color would light itself", () => {
    const { material, warnings } = buildMaterial(graph('diffuse', 'principled'));
    expect(material.outputNode).toBeNull();
    expect(warnings.join()).toContain('base color');
  });

  it('uses the base color in unlit mode', () => {
    const { material, warnings } = buildMaterial(graph('diffuse', 'emission'), { unlit: true });
    expect(material.outputNode).toBeNull();
    expect(warnings.join()).toContain('base color');
  });
});
