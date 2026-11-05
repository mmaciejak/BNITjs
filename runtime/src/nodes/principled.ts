import type { NodeImpl } from '../graph/evaluate.js';

/** Inputs mapped so far; anything else that is linked or changed is reported once. */
const MAPPED = new Set([
  'Base Color',
  'Metallic',
  'Roughness',
  'Alpha',
  'Emission Color',
  'Emission Strength',
  'Normal',
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
 * Principled BSDF, base inputs (Phase 2): base color, metallic, roughness, alpha, emission.
 * Coat, sheen, transmission, IOR, thin film and anisotropy follow in Phase 8. A linked Normal
 * sets the material's shading normal.
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
    },
  };
};
