import {
  cameraViewMatrix,
  cross,
  dFdx,
  dFdy,
  dot,
  modelWorldMatrixInverse,
  normalWorld,
  positionLocal,
  positionWorld,
  select,
  vec4,
} from 'three/tsl';
import type { NodeMaterial } from 'three/webgpu';
import type { Vec3Node } from './convert.js';
import { toBlender } from '../nodes/space.js';
import type { Texture } from 'three/webgpu';
import { createRegistry } from '../nodes/registry.js';
import { type BlenderShaderMaterial, MaterialParams, registerParams } from '../params/params.js';
import { isClosure } from '../shaders/closures.js';
import { materialFromClosure, type MaterialOptions } from '../shaders/material.js';
import { GraphEvaluator, type NodeImpl } from './evaluate.js';
import { parseGraph } from './parse.js';

export interface BuildOptions extends MaterialOptions {
  /** Extra or overriding node implementations, keyed by Blender node type. */
  nodes?: Record<string, NodeImpl>;
  /** glTF textures referenced by Image Texture nodes, by glTF texture index (the loader fills this). */
  textures?: ReadonlyMap<number, Texture>;
  onWarning?: (message: string) => void;
}

export interface BuildResult {
  material: BlenderShaderMaterial;
  params: MaterialParams;
  warnings: string[];
}

/** Build a three.js node material from an EXT_blender_shader_graph payload. */
/**
 * The Material Output's Displacement (an offset in Blender's world axes). "Bump Only" (Blender's
 * default) shades with the normal of the displaced surface, from screen-space derivatives of
 * P + offset, unless the BSDF already sets a normal. "Displacement" moves the vertices.
 */
function applyDisplacement(
  material: NodeMaterial,
  offset: Vec3Node,
  method: string,
  warn: (message: string) => void,
): void {
  if (method === 'BUMP') {
    if (material.normalNode) return;
    const p = toBlender(positionWorld).add(offset);
    const raw = cross(dFdx(p), dFdy(p)).normalize();
    const n = toBlender(normalWorld);
    const bumped = select(dot(raw, n).lessThan(0), raw.negate(), raw);
    material.normalNode = cameraViewMatrix
      .mul(vec4(bumped.x, bumped.z, bumped.y.negate(), 0))
      .xyz.normalize();
    return;
  }
  if (method === 'BOTH') warn('Displacement "Displacement and Bump" moves the vertices only');
  const local = modelWorldMatrixInverse.mul(vec4(offset.x, offset.z, offset.y.negate(), 0)).xyz;
  material.positionNode = positionLocal.add(local);
}

export function buildMaterial(graphJson: unknown, options: BuildOptions = {}): BuildResult {
  const graph = parseGraph(graphJson);
  const params = new MaterialParams(graph);
  const evaluator = new GraphEvaluator(graph, {
    registry: createRegistry(options.nodes),
    textures: options.textures,
    params,
    onWarning: options.onWarning,
  });
  const outputs = evaluator.outputs(graph.output);
  const surface = outputs.Surface ?? null;
  const material = materialFromClosure(
    isClosure(surface) ? surface : null,
    options,
  ) as BlenderShaderMaterial;
  const offset = outputs.Displacement;
  if (offset && !isClosure(offset)) {
    applyDisplacement(material, offset as Vec3Node, graph.displacementMethod ?? 'BUMP', (m) =>
      evaluator.warn(m),
    );
  }
  material.name = graph.material;
  material.params = params;
  material.userData.blenderShaderGraph = {
    warnings: evaluator.warnings,
    ...(params.names().length ? { params: registerParams(params) } : {}),
  };
  return { material, params, warnings: evaluator.warnings };
}

/** glTF texture indices referenced by Image Texture nodes of a graph. */
export function textureIndices(graphJson: unknown): number[] {
  const graph = graphJson as {
    nodes?: Record<string, { properties?: { image?: { texture?: number } } }>;
  };
  const indices = new Set<number>();
  for (const node of Object.values(graph.nodes ?? {})) {
    const index = node.properties?.image?.texture;
    if (typeof index === 'number') indices.add(index);
  }
  return [...indices];
}
