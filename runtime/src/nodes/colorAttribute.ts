import { attribute, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { NodeContext, NodeImpl } from '../graph/evaluate.js';

/** three.js attribute for glTF COLOR_n. */
export function vertexColor(index: number): Node<'vec4'> {
  return attribute(index === 0 ? 'color' : `color_${index}`, 'vec4') as unknown as Node<'vec4'>;
}

/**
 * glTF COLOR_n index of a Blender color attribute (empty name: the render-active one), using the
 * layout the exporter records per object; undefined when it wasn't exported.
 */
export function colorAttributeIndex(ctx: NodeContext, name: string): number | undefined {
  const layout = ctx.graph.colorAttributes;
  const wanted = name || layout?.render;
  return layout?.layers.find((l) => l.name === wanted)?.index;
}

/** Color Attribute: the named (or render-active) color attribute. */
export const colorAttribute: NodeImpl = (ctx) => {
  const name = ctx.prop<string>('layer_name', '');
  const index = colorAttributeIndex(ctx, name);
  if (index === undefined) {
    ctx.warn(`color attribute "${name || 'render-active'}" was not exported; using white`);
    return { Color: vec4(1).xyz, Alpha: vec4(1).w };
  }
  const c = vertexColor(index);
  return { Color: c.xyz, Alpha: c.w };
};
