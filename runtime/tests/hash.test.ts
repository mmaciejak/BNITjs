import { describe, expect, it } from 'vitest';
import { hashFloat2JS, hashUint2JS } from '../src/nodes/hash.js';

describe('Cycles hash (JS)', () => {
  it('matches the exporter hash_uint2 used for Object Info Random', () => {
    // Values from exporter/gltf_hooks.py hash_uint2, which the object_info parity scene verifies.
    expect(hashUint2JS(0, 0)).toBe(3695015161);
    expect(hashUint2JS(1, 2)).toBe(272092061);
    expect(hashUint2JS(0xffffffff, 7)).toBe(847497518);
    expect(hashUint2JS(123456789, 987654321)).toBe(1022253463);
  });

  it('maps to [0, 1] like hash_uint_to_float', () => {
    const v = hashFloat2JS(0, 0);
    expect(v).toBeCloseTo(3695015161 / 4294967296, 6);
    expect(Math.fround(v)).toBe(v);
  });
});
