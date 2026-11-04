import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { buildMaterial } from '../src/graph/build.js';
import type { ShaderGraph } from '../src/graph/types.js';

/** Material Output <- <type> BSDF with Color (0.2, 0.4, 0.6) and Roughness 0.3. */
export function bsdfGraph(type: string): ShaderGraph {
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
      B: {
        type,
        name: 'B',
        outputs: { BSDF: { name: 'BSDF', type: 'SHADER' } },
        inputs: {
          Color: { name: 'Color', type: 'RGBA', value: [0.2, 0.4, 0.6, 1] },
          Roughness: { name: 'Roughness', type: 'VALUE', value: 0.3 },
        },
      },
    },
    links: [{ from: ['B', 'BSDF'], to: ['Out', 'Surface'] }],
  };
}

export { buildMaterial, describe, expect, it, MeshPhysicalNodeMaterial };
