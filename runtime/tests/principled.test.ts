import type { MeshPhysicalNodeMaterial } from 'three/webgpu';
import type { ShaderGraph } from '../src/graph/types.js';
import { buildMaterial, describe, expect, it } from './bsdf.js';

/** A Principled BSDF with the given unlinked input values. */
function principled(values: Record<string, unknown>): ShaderGraph {
  const inputs: Record<string, { name: string; type: 'VALUE' | 'RGBA'; value: unknown }> = {};
  for (const [id, value] of Object.entries(values)) {
    inputs[id] = { name: id, type: Array.isArray(value) ? 'RGBA' : 'VALUE', value };
  }
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
      P: {
        type: 'ShaderNodeBsdfPrincipled',
        name: 'P',
        outputs: { BSDF: { name: 'BSDF', type: 'SHADER' } },
        inputs: inputs as never,
      },
    },
    links: [{ from: ['P', 'BSDF'], to: ['Out', 'Surface'] }],
  };
}

const build = (values: Record<string, unknown>) => {
  const { material, warnings } = buildMaterial(principled(values));
  return { m: material as unknown as MeshPhysicalNodeMaterial, warnings };
};

describe('Principled BSDF extras', () => {
  it('leaves the physical extras off at Blender defaults', () => {
    const { m, warnings } = build({ 'Coat Weight': 0, 'Sheen Weight': 0, IOR: 1.5 });
    expect(m.clearcoatNode).toBeNull();
    expect(m.sheenNode).toBeNull();
    expect(m.transmissionNode).toBeNull();
    expect(m.iorNode).toBeNull();
    expect(warnings).toEqual([]);
  });

  it('maps coat, sheen, transmission, IOR, specular, thin film and anisotropy', () => {
    const { m, warnings } = build({
      'Coat Weight': 1,
      'Coat Roughness': 0.1,
      'Sheen Weight': 0.5,
      'Sheen Tint': [1, 0.5, 0.2, 1],
      'Transmission Weight': 1,
      IOR: 1.45,
      'Specular IOR Level': 0.7,
      'Specular Tint': [1, 0.9, 0.8, 1],
      'Thin Film Thickness': 300,
      Anisotropic: 0.6,
    });
    expect(m.clearcoatNode).toBeTruthy();
    expect(m.clearcoatRoughnessNode).toBeTruthy();
    expect(m.sheenNode).toBeTruthy();
    expect(m.sheenRoughnessNode).toBeTruthy();
    expect(m.transmissionNode).toBeTruthy();
    expect(m.iorNode).toBeTruthy();
    expect(m.specularIntensityNode).toBeTruthy();
    expect(m.specularColorNode).toBeTruthy();
    expect(m.iridescenceNode).toBeTruthy();
    expect(m.iridescenceThicknessNode).toBeTruthy();
    expect(m.anisotropyNode).toBeTruthy();
    expect(warnings).toEqual([]);
  });

  it('still reports what it cannot map', () => {
    const { warnings } = build({ 'Subsurface Weight': 0.5, 'Coat Weight': 1, 'Coat IOR': 1.8 });
    expect(warnings.join()).toContain('Subsurface');
    expect(warnings.join()).toContain('Coat IOR');
  });
});
