import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtinNodes } from '../src/nodes/registry.js';
import { REPO } from './fixtures.js';

interface SupportEntry {
  name: string;
  types: string[];
  section: string;
  status: string;
}

const support: SupportEntry[] = JSON.parse(
  readFileSync(join(REPO, 'schema', 'node-support.json'), 'utf8'),
);
const LIVE = new Set(['supported', 'partial']);

describe('node registry matches schema/node-support.json', () => {
  const registered = new Set(Object.keys(builtinNodes).filter((t) => !t.startsWith('BSW_')));

  it('every registered node is marked supported or partial', () => {
    const notLive = support.filter(
      (e) => !LIVE.has(e.status) && e.types.some((t) => registered.has(t)),
    );
    expect(notLive.map((e) => e.name)).toEqual([]);
  });

  it('every supported or partial node is registered (layout nodes are handled by the exporter)', () => {
    const missing = support
      .filter((e) => LIVE.has(e.status) && e.section !== 'Layout')
      .flatMap((e) => e.types.filter((t) => !registered.has(t)));
    expect(missing).toEqual([]);
  });
});
