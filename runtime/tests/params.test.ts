import { Color } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { buildMaterial } from '../src/graph/build.js';
import { getParams } from '../src/params/params.js';
import { fixtureGraph } from './fixtures.js';

describe('live parameters', () => {
  const build = () => buildMaterial(fixtureGraph('params'));

  it('exposes the $-labelled nodes and group inputs with their defaults and ranges', () => {
    const { params, warnings } = build();
    expect(warnings).toEqual([]);
    expect(params.names().sort()).toEqual(['Scale', 'Tint', 'Wood/Grain', 'Wood/Shade']);
    expect(params.get('Scale')).toBe(2.5);
    expect(params.info('Wood/Grain')).toMatchObject({ default: 3, min: 0.5, max: 8 });
    expect((params.get('Tint') as number[]).map((v) => +v.toFixed(3))).toEqual([0.9, 0.3, 0.1]);
  });

  it('is reachable from the material', () => {
    const { material, params } = build();
    expect(material.params).toBe(params);
    expect(getParams(material)).toBe(params);
  });

  it('sets numbers and colors, and resets to the defaults', () => {
    const { params } = build();
    params
      .set('Scale', 4)
      .set('Tint', [0.1, 0.2, 0.3])
      .set('Wood/Shade', new Color(1, 0, 0));
    expect(params.get('Scale')).toBe(4);
    expect(params.get('Tint')).toEqual([0.1, 0.2, 0.3]);
    expect(params.get('Wood/Shade')).toEqual([1, 0, 0]);
    params.reset();
    expect(params.get('Scale')).toBe(2.5);
  });

  it('rejects unknown names and wrong value types', () => {
    const { params } = build();
    expect(() => params.set('Nope', 1)).toThrow(/unknown parameter/);
    expect(() => params.set('Scale', [1, 2, 3])).toThrow(TypeError);
  });
});
