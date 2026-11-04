import type { Texture } from 'three/webgpu';
import { createRegistry } from '../nodes/registry.js';
import { type BlenderShaderMaterial, MaterialParams } from '../params/params.js';
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
export function buildMaterial(graphJson: unknown, options: BuildOptions = {}): BuildResult {
  const graph = parseGraph(graphJson);
  const params = new MaterialParams(graph);
  const evaluator = new GraphEvaluator(graph, {
    registry: createRegistry(options.nodes),
    textures: options.textures,
    params,
    onWarning: options.onWarning,
  });
  const surface = evaluator.outputs(graph.output).Surface ?? null;
  const material = materialFromClosure(
    isClosure(surface) ? surface : null,
    options,
  ) as BlenderShaderMaterial;
  material.name = graph.material;
  material.params = params;
  material.userData.blenderShaderGraph = { warnings: evaluator.warnings };
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
