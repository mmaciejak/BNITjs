import { float, vec3 } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import type { Closure, PrincipledClosure } from '../src/shaders/closures.js';
import { addClosures, mixClosures } from '../src/shaders/combine.js';

const emission = (c: number): Closure => ({ kind: 'emission', color: vec3(c) });
const transparent: Closure = { kind: 'emission', color: vec3(0), alpha: float(0) };
const principled = (extra: Partial<PrincipledClosure> = {}): PrincipledClosure => ({
  kind: 'principled',
  baseColor: vec3(0.8),
  metallic: float(0),
  roughness: float(0.5),
  alpha: float(1),
  transparent: false,
  emission: vec3(0),
  ...extra,
});
const warnings: string[] = [];
const warn = (m: string) => warnings.push(m);

describe('Mix Shader', () => {
  it('keeps two emissions an emission, opaque', () => {
    const out = mixClosures(emission(1), emission(0), float(0.5));
    expect(out?.kind).toBe('emission');
    expect(out && 'alpha' in out ? out.alpha : undefined).toBeUndefined();
  });

  it('gives transparency an opacity', () => {
    const out = mixClosures(transparent, emission(1), float(0.25));
    expect(out?.kind).toBe('emission');
    expect(out && out.kind === 'emission' ? out.alpha : undefined).toBeDefined();
  });

  it('mixes BSDF parameters, including the extras of either side', () => {
    const out = mixClosures(
      principled(),
      principled({ coat: { weight: float(1), roughness: float(0.1) } }),
      float(0.5),
    );
    expect(out?.kind).toBe('principled');
    expect((out as PrincipledClosure).coat).toBeDefined();
  });

  it('turns an emission mixed with a BSDF into BSDF emission', () => {
    const out = mixClosures(principled(), emission(1), float(0.5)) as PrincipledClosure;
    expect(out.kind).toBe('principled');
    expect(out.specular).toBeDefined(); // the emission side has no specular
  });

  it('treats a missing shader as black', () => {
    expect(mixClosures(null, emission(1), float(0.5))?.kind).toBe('emission');
  });
});

describe('Add Shader', () => {
  it('adds emission to a BSDF', () => {
    const out = addClosures(principled(), emission(1), warn) as PrincipledClosure;
    expect(out.kind).toBe('principled');
  });

  it('reports adding two BSDFs as an approximation', () => {
    warnings.length = 0;
    addClosures(principled(), principled(), warn);
    expect(warnings.join()).toContain('approximated');
  });
});
