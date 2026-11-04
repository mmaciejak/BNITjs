import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const SCHEMA_DIR = join(import.meta.dirname, '..', '..', 'schema');
const EXT = 'EXT_blender_shader_graph';

const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, 'graph.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validateGraph = ajv.compile(schema);
const validateObject = ajv.compile({ $ref: `${schema.$id}#/$defs/objectExtension` });

const fixtures = readdirSync(join(SCHEMA_DIR, 'fixtures')).filter((f) => f.endsWith('.gltf'));

describe('graph schema', () => {
  it('has fixtures to validate', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const file of fixtures) {
    it(`validates ${file}`, () => {
      const gltf = JSON.parse(readFileSync(join(SCHEMA_DIR, 'fixtures', file), 'utf8'));
      expect(gltf.extensionsUsed).toContain(EXT);
      expect(gltf.extensionsRequired ?? []).not.toContain(EXT);
      for (const material of gltf.materials) {
        const graph = material.extensions[EXT];
        const ok = validateGraph(graph);
        expect(validateGraph.errors ?? []).toEqual([]);
        expect(ok).toBe(true);
        expect(graph.nodes[graph.output]).toBeDefined();
        for (const link of graph.links ?? []) {
          expect(
            graph.nodes[link.from[0]]?.outputs?.[link.from[1]],
            `from ${link.from}`,
          ).toBeDefined();
          expect(graph.nodes[link.to[0]]?.inputs?.[link.to[1]], `to ${link.to}`).toBeDefined();
        }
      }
      for (const node of gltf.nodes.filter((n: { mesh?: number }) => n.mesh !== undefined)) {
        expect(validateObject(node.extensions[EXT])).toBe(true);
      }
    });
  }

  it('rejects a graph with an unknown version', () => {
    expect(
      validateGraph({ version: 2, generator: {}, material: 'x', output: 'o', nodes: {} }),
    ).toBe(false);
  });
});
