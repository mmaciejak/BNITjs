/**
 * Glass, Refraction, Metallic and Specular (EEVEE) BSDFs as three.js physical-material
 * parameters. three.js's BSDFs are not Cycles', so these are close, not identical.
 */
import { float, vec3 } from 'three/tsl';
import type { NodeContext, NodeImpl } from '../graph/evaluate.js';
import type { PrincipledClosure } from '../shaders/closures.js';

const normal = (ctx: NodeContext, id = 'Normal') =>
  ctx.isLinked(id) ? { normal: ctx.vec3(id) } : {};

function thinFilm(ctx: NodeContext): Partial<PrincipledClosure> {
  if (!ctx.isLinked('Thin Film Thickness') && !Number(ctx.inputValue('Thin Film Thickness') ?? 0)) {
    return {};
  }
  return {
    thinFilm: {
      thickness: ctx.float('Thin Film Thickness', 0),
      ior: ctx.float('Thin Film IOR', 1.33),
    },
  };
}

/** Glass BSDF: fully transmissive, tinted by Color, with IOR and roughness. */
export const glass: NodeImpl = (ctx) => ({
  BSDF: {
    kind: 'principled',
    baseColor: ctx.vec3('Color', [1, 1, 1]),
    metallic: float(0),
    roughness: ctx.float('Roughness', 0),
    alpha: float(1),
    transparent: false,
    emission: vec3(0),
    transmission: float(1),
    ior: ctx.float('IOR', 1.5),
    ...normal(ctx),
    ...thinFilm(ctx),
  },
});

/** Refraction BSDF: like Glass without the reflection (specular 0). */
export const refraction: NodeImpl = (ctx) => ({
  BSDF: {
    kind: 'principled',
    baseColor: ctx.vec3('Color', [1, 1, 1]),
    metallic: float(0),
    roughness: ctx.float('Roughness', 0),
    alpha: float(1),
    transparent: false,
    emission: vec3(0),
    transmission: float(1),
    ior: ctx.float('IOR', 1.45),
    specular: float(0),
    ...normal(ctx),
  },
});

/**
 * Metallic BSDF (Blender 4.3+): a metal with Base Color reflectance. three.js has no edge tint or
 * complex IOR, so Edge Tint and the Physical Conductor mode are reported and ignored.
 */
export const metallic: NodeImpl = (ctx) => {
  if (ctx.prop<string>('fresnel_type', 'F82') === 'PHYSICAL_CONDUCTOR') {
    ctx.warn('Physical Conductor (IOR, Extinction) is rendered from Base Color');
  } else if (ctx.isLinked('Edge Tint')) {
    ctx.warn('Edge Tint has no three.js equivalent and is ignored');
  }
  const anisotropic = ctx.isLinked('Anisotropy') || Number(ctx.inputValue('Anisotropy') ?? 0) !== 0;
  return {
    BSDF: {
      kind: 'principled',
      baseColor: ctx.vec3('Base Color', [0.617, 0.577, 0.54]),
      metallic: float(1),
      roughness: ctx.float('Roughness', 0.5),
      alpha: float(1),
      transparent: false,
      emission: vec3(0),
      ...normal(ctx),
      ...thinFilm(ctx),
      ...(anisotropic
        ? {
            anisotropy: {
              strength: ctx.float('Anisotropy', 0),
              rotation: ctx.float('Rotation', 0).mul(2 * Math.PI),
            },
          }
        : {}),
    },
  };
};

/**
 * Specular BSDF (EEVEE only; Cycles renders it black): a dielectric with a Specular color,
 * emission, transparency and a clear coat.
 */
export const eeveeSpecular: NodeImpl = (ctx) => {
  const transparency = ctx.float('Transparency', 0);
  const transparent =
    ctx.isLinked('Transparency') || Number(ctx.inputValue('Transparency') ?? 0) > 0;
  const coat = ctx.isLinked('Clear Coat') || Number(ctx.inputValue('Clear Coat') ?? 0) > 0;
  ctx.warn('Specular BSDF is EEVEE-only (Cycles renders it black); mapped like EEVEE');
  return {
    BSDF: {
      kind: 'principled',
      baseColor: ctx.vec3('Base Color', [0.8, 0.8, 0.8]),
      metallic: float(0),
      roughness: ctx.float('Roughness', 0.2),
      alpha: float(1).sub(transparency),
      transparent,
      emission: ctx.vec3('Emissive Color', [0, 0, 0]),
      // F0 of the default IOR 1.5 is 0.04; three.js's specularColor tints that.
      specularColor: ctx.vec3('Specular', [0.03, 0.03, 0.03]).div(0.04),
      ...normal(ctx),
      ...(coat
        ? {
            coat: {
              weight: ctx.float('Clear Coat', 0),
              roughness: ctx.float('Clear Coat Roughness', 0),
              ...(ctx.isLinked('Clear Coat Normal')
                ? { normal: ctx.vec3('Clear Coat Normal') }
                : {}),
            },
          }
        : {}),
    },
  };
};
