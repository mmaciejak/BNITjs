import type { NodeImpl } from '../graph/evaluate.js';
import { blenderUV } from './space.js';

/** UV Map: the named UV map (empty name: the active render map), as Blender's (u, v, 0). */
export const uvMap: NodeImpl = (ctx) => {
  if (ctx.prop('from_instancer', false)) ctx.warn('From Instancer is not supported');
  const name = ctx.prop<string>('uv_map', '');
  const maps = ctx.graph.uvMaps;
  let index = maps?.activeRender ?? 0;
  if (name) {
    const found = maps?.names.indexOf(name) ?? -1;
    if (found < 0) ctx.warn(`UV map "${name}" was not exported; using the active render map`);
    else index = found;
  }
  return { UV: blenderUV(index) };
};
