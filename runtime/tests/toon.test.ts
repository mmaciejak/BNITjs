import { DataUtils, MeshPhysicalNodeMaterial, MeshToonNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { buildMaterial } from '../src/graph/build.js';
import { toonGradient } from '../src/nodes/toon.js';
import { bsdfGraph } from './bsdf.js';

/** The gradient's value where N·L = dotNL (texel centers at (i + 0.5) / n, x = N·L · 0.5 + 0.5). */
function at(size: number, smooth: number, dotNL: number): number {
  const data = toonGradient(size, smooth).image.data as Uint16Array;
  const i = Math.min(data.length - 1, Math.floor((dotNL * 0.5 + 0.5) * data.length));
  return DataUtils.fromHalfFloat(data[i]!);
}

describe('Toon BSDF', () => {
  it("reproduces Cycles' toon lobe: flat up to Size·90°, normalized by the sampled cone", () => {
    // Size 0.5, Smooth 0: lit within 45° of the light, at ½ / (1 − cos 45°).
    const lit = 0.5 / (1 - Math.cos(Math.PI / 4));
    expect(at(0.5, 0, 0.99)).toBeCloseTo(lit, 2);
    expect(at(0.5, 0, 0.75)).toBeCloseTo(lit, 2); // 41°
    expect(at(0.5, 0, 0.65)).toBe(0); // 49°
    expect(at(0.5, 0, -0.5)).toBe(0);
    // Smooth 0.5 fades linearly from 45° to 90°: at 67.5° intensity is ½, the cone is 90°.
    expect(at(0.5, 0.5, Math.cos((67.5 * Math.PI) / 180))).toBeCloseTo(0.5 * 0.5, 1);
  });

  it('builds a toon material', () => {
    const { material, warnings } = buildMaterial(bsdfGraph('ShaderNodeBsdfToon'));
    expect(material).toBeInstanceOf(MeshToonNodeMaterial);
    expect((material as unknown as MeshToonNodeMaterial).gradientMap).toBeTruthy();
    expect(warnings).toEqual([]);
  });

  it('becomes a diffuse surface when mixed with another shader', () => {
    const graph = bsdfGraph('ShaderNodeBsdfToon');
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
      { from: ['B', 'BSDF'], to: ['Mix', 'Shader'] },
      { from: ['Mix', 'Shader'], to: ['Out', 'Surface'] },
    ];
    expect(buildMaterial(graph).material).toBeInstanceOf(MeshPhysicalNodeMaterial);
  });
});
