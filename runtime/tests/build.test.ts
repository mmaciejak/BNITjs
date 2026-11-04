import { MeshBasicNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { buildMaterial } from '../src/graph/build.js';
import { GraphFormatError } from '../src/graph/parse.js';
import type { ShaderGraph } from '../src/graph/types.js';
import { fixtureGraph, fixtureNames } from './fixtures.js';

describe('buildMaterial', () => {
  for (const name of fixtureNames()) {
    it(`builds ${name} without throwing`, () => {
      const { material } = buildMaterial(fixtureGraph(name));
      expect(material.name).toBe(name);
    });
  }

  it('warns about unknown nodes instead of failing', () => {
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
        Mystery: {
          type: 'ShaderNodeDoesNotExist',
          name: 'Mystery',
          outputs: { BSDF: { name: 'BSDF', type: 'SHADER' } },
        },
      },
      links: [{ from: ['Mystery', 'BSDF'], to: ['Out', 'Surface'] }],
    };
    const warnings: string[] = [];
    const { material } = buildMaterial(graph, { onWarning: (w) => warnings.push(w) });
    expect(material).toBeInstanceOf(MeshBasicNodeMaterial); // unlinked surface -> black
    expect(warnings.join('\n')).toContain('ShaderNodeDoesNotExist');
  });

  it('builds an Emission material', () => {
    const { material } = buildMaterial(fixtureGraph('emission_rgb'), { unlit: true });
    expect(material).toBeInstanceOf(MeshBasicNodeMaterial);
    expect((material as MeshBasicNodeMaterial).colorNode).toBeTruthy();
  });

  it('rejects other format versions', () => {
    expect(() => buildMaterial({ ...fixtureGraph('emission_rgb'), version: 99 })).toThrow(
      GraphFormatError,
    );
  });
});
