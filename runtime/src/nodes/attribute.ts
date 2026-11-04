import { attribute as meshAttribute, float, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { Vec3Node } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';
import { colorAttributeIndex, vertexColor } from './colorAttribute.js';
import { blenderUV } from './space.js';

/** Cycles' svm_node_attr gives Fac as the average of the components. */
const average = (v: Vec3Node) => v.x.add(v.y).add(v.z).div(3);

/**
 * Attribute (Geometry type). Resolves the name to:
 * - an exported UV map (by name) → that TEXCOORD;
 * - a name starting with "_" → the custom glTF attribute of that name (export with the glTF
 *   "Attributes" option; three.js lower-cases it);
 * - a color attribute → its glTF COLOR_n (layout recorded by the exporter).
 * Instancer, Object and View Layer attribute types are not supported.
 */
export const attribute: NodeImpl = (ctx) => {
  const type = ctx.prop<string>('attribute_type', 'GEOMETRY');
  const name = ctx.prop<string>('attribute_name', '');
  if (type !== 'GEOMETRY') {
    ctx.warn(`attribute type ${type} is not supported`);
    return { Color: vec3(0), Vector: vec3(0), Fac: float(0), Alpha: float(1) };
  }
  const uvIndex = ctx.graph.uvMaps?.names.indexOf(name) ?? -1;
  if (uvIndex >= 0) {
    const uv = blenderUV(uvIndex);
    return { Color: uv, Vector: uv, Fac: average(uv), Alpha: float(1) };
  }
  if (name.startsWith('_')) {
    const v = meshAttribute(name.toLowerCase(), 'vec4') as unknown as Node<'vec4'>;
    return { Color: v.xyz, Vector: v.xyz, Fac: v.x, Alpha: v.w };
  }
  const index = colorAttributeIndex(ctx, name);
  if (index === undefined) {
    ctx.warn(
      `attribute "${name}" was not exported (color attributes, UV maps and "_" attributes are)`,
    );
    return { Color: vec3(0), Vector: vec3(0), Fac: float(0), Alpha: float(1) };
  }
  const c = vertexColor(index);
  return { Color: c.xyz, Vector: c.xyz, Fac: average(c.xyz), Alpha: c.w };
};
