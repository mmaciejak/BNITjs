import { describe, expect, it } from 'vitest';
import type { NodeContext } from '../src/graph/evaluate.js';
import { blenderMajor } from '../src/nodes/voronoi.js';

const ctxFor = (blender?: string) =>
  ({ graph: { generator: blender ? { blender } : undefined } }) as unknown as NodeContext;

describe('Voronoi cell hashing by Blender version', () => {
  it('reads the major version of the exporting Blender', () => {
    expect(blenderMajor(ctxFor('4.2.3 LTS'))).toBe(4);
    expect(blenderMajor(ctxFor('5.2.2 LTS'))).toBe(5);
    expect(blenderMajor(ctxFor('10.0.0'))).toBe(10);
  });

  it('assumes the current hashing when the version is unknown', () => {
    expect(blenderMajor(ctxFor())).toBe(5);
    expect(blenderMajor(ctxFor('custom build'))).toBe(5);
  });
});
