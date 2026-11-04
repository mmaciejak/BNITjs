import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXTENSION_NAME, type ShaderGraph } from '../src/graph/types.js';

export const REPO = join(import.meta.dirname, '..', '..');
export const FIXTURES = join(REPO, 'schema', 'fixtures');

export function fixtureNames(): string[] {
  return readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.gltf'))
    .map((f) => f.replace(/\.gltf$/, ''));
}

/** The material graph of a fixture exported by exporter/tests/make_fixtures.py. */
export function fixtureGraph(name: string): ShaderGraph {
  const gltf = JSON.parse(readFileSync(join(FIXTURES, `${name}.gltf`), 'utf8'));
  return gltf.materials[0].extensions[EXTENSION_NAME];
}
