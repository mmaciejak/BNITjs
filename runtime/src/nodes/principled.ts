import type { NodeContext, NodeImpl } from '../graph/evaluate.js';
import type { PrincipledClosure } from '../shaders/closures.js';

/** Inputs mapped so far; anything else that is linked or changed is reported once. */
const MAPPED = new Set([
  'Base Color',
  'Metallic',
  'Roughness',
  'Alpha',
  'Emission Color',
  'Emission Strength',
  'Normal',
  'IOR',
  'Specular IOR Level',
  'Specular Tint',
  'Coat Weight',
  'Coat Roughness',
  'Coat Normal',
  'Coat IOR',
  'Coat Tint',
  'Sheen Weight',
  'Sheen Roughness',
  'Sheen Tint',
  'Transmission Weight',
  'Thin Film Thickness',
  'Thin Film IOR',
  'Anisotropic',
  'Anisotropic Rotation',
]);

/** Inputs that are at their Blender defaults have no visible effect, so they are not reported. */
const DEFAULTS: Record<string, unknown> = {
  IOR: 1.5,
  'Specular IOR Level': 0.5,
  'Specular Tint': [1, 1, 1, 1],
  'Coat Weight': 0,
  'Sheen Weight': 0,
  'Transmission Weight': 0,
  'Subsurface Weight': 0,
  Anisotropic: 0,
  'Thin Film Thickness': 0,
};

/**
 * Principled BSDF → three.js physical material: base color, metallic, roughness, alpha, emission,
 * normal, and (Phase 8) coat, sheen, transmission, IOR, specular level and tint, thin film and
 * anisotropy. Subsurface is reported and ignored.
 */
export const principled: NodeImpl = (ctx) => {
  const alphaLinked = ctx.isLinked('Alpha');
  const alphaValue = ctx.inputValue('Alpha');
  for (const [identifier, socket] of Object.entries(ctx.node.inputs ?? {})) {
    if (MAPPED.has(identifier) || socket.type === 'SHADER') continue;
    const changed =
      identifier in DEFAULTS &&
      JSON.stringify(socket.value) !== JSON.stringify(DEFAULTS[identifier]);
    if (ctx.isLinked(identifier) || changed) {
      ctx.warn(`input "${socket.name}" is not supported yet and is ignored`);
    }
  }
  return {
    BSDF: {
      kind: 'principled',
      baseColor: ctx.vec3('Base Color', [0.8, 0.8, 0.8]),
      metallic: ctx.float('Metallic', 0),
      roughness: ctx.float('Roughness', 0.5),
      alpha: ctx.float('Alpha', 1),
      transparent: alphaLinked || (typeof alphaValue === 'number' && alphaValue < 1),
      emission: ctx.vec3('Emission Color', [1, 1, 1]).mul(ctx.float('Emission Strength', 0)),
      ...(ctx.isLinked('Normal') ? { normal: ctx.vec3('Normal') } : {}),
      ...extras(ctx),
    },
  };
};

/** Whether an input changes the result: linked, or set away from `idle`. */
function active(ctx: NodeContext, identifier: string, idle: number): boolean {
  return ctx.isLinked(identifier) || Number(ctx.inputValue(identifier) ?? idle) !== idle;
}

/**
 * Coat, sheen, transmission, IOR / specular, thin film and anisotropy, mapped onto three.js's
 * physical material. Its BSDFs differ from Cycles', so these are close but not identical.
 */
function extras(ctx: NodeContext): Partial<PrincipledClosure> {
  const out: Partial<PrincipledClosure> = {};
  if (active(ctx, 'Coat Weight', 0)) {
    if (active(ctx, 'Coat IOR', 1.5) || ctx.isLinked('Coat Tint')) {
      ctx.warn('Coat IOR and Coat Tint have no three.js equivalent and are ignored');
    }
    out.coat = {
      weight: ctx.float('Coat Weight', 0),
      roughness: ctx.float('Coat Roughness', 0.03),
      ...(ctx.isLinked('Coat Normal') ? { normal: ctx.vec3('Coat Normal') } : {}),
    };
  }
  if (active(ctx, 'Sheen Weight', 0)) {
    out.sheen = {
      color: ctx.vec3('Sheen Tint', [1, 1, 1]).mul(ctx.float('Sheen Weight', 0)),
      roughness: ctx.float('Sheen Roughness', 0.5),
    };
  }
  if (active(ctx, 'Transmission Weight', 0)) out.transmission = ctx.float('Transmission Weight', 0);
  if (active(ctx, 'IOR', 1.5)) out.ior = ctx.float('IOR', 1.5);
  // Specular IOR Level 0.5 is neutral; three.js's specularIntensity 1 is neutral.
  if (active(ctx, 'Specular IOR Level', 0.5)) {
    out.specular = ctx.float('Specular IOR Level', 0.5).mul(2);
  }
  const tint = ctx.inputValue('Specular Tint');
  if (ctx.isLinked('Specular Tint') || JSON.stringify(tint) !== JSON.stringify([1, 1, 1, 1])) {
    out.specularColor = ctx.vec3('Specular Tint', [1, 1, 1]);
  }
  if (active(ctx, 'Thin Film Thickness', 0)) {
    out.thinFilm = {
      thickness: ctx.float('Thin Film Thickness', 0),
      ior: ctx.float('Thin Film IOR', 1.33),
    };
  }
  if (active(ctx, 'Anisotropic', 0)) {
    if (ctx.isLinked('Tangent'))
      ctx.warn('the Tangent input is ignored (three.js uses mesh tangents)');
    out.anisotropy = {
      strength: ctx.float('Anisotropic', 0),
      rotation: ctx.float('Anisotropic Rotation', 0).mul(2 * Math.PI),
    };
  }
  return out;
}
