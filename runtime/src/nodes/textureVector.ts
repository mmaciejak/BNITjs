import type { Vec3Node } from '../graph/convert.js';
import type { NodeContext } from '../graph/evaluate.js';
import { generatedCoords } from './space.js';

/**
 * The Vector input of a procedural texture: Generated coordinates when unlinked, as in
 * Blender. Warns about the legacy Texture Mapping / Color Mapping panel, which isn't supported.
 */
export function textureVector(ctx: NodeContext): Vec3Node {
  if (
    ctx.prop<unknown>('textureMapping', undefined) ||
    ctx.prop<unknown>('colorMapping', undefined)
  ) {
    ctx.warn('the Texture Mapping / Color Mapping settings in the sidebar are not supported');
  }
  return ctx.isLinked('Vector') ? ctx.vec3('Vector') : generatedCoords();
}
