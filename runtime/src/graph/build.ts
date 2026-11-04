import type { NodeMaterial } from 'three/webgpu';
import { createRegistry } from '../nodes/registry.js';
import { isClosure } from '../shaders/closures.js';
import { materialFromClosure, type MaterialOptions } from '../shaders/material.js';
import { GraphEvaluator, type NodeImpl } from './evaluate.js';
import { parseGraph } from './parse.js';

export interface BuildOptions extends MaterialOptions {
  /** Extra or overriding node implementations, keyed by Blender node type. */
  nodes?: Record<string, NodeImpl>;
  onWarning?: (message: string) => void;
}

export interface BuildResult {
  material: NodeMaterial;
  warnings: string[];
}

/** Build a three.js node material from an EXT_blender_shader_graph payload. */
export function buildMaterial(graphJson: unknown, options: BuildOptions = {}): BuildResult {
  const graph = parseGraph(graphJson);
  const evaluator = new GraphEvaluator(graph, {
    registry: createRegistry(options.nodes),
    onWarning: options.onWarning,
  });
  const surface = evaluator.outputs(graph.output).Surface ?? null;
  const material = materialFromClosure(isClosure(surface) ? surface : null, options);
  material.name = graph.material;
  material.userData.blenderShaderGraph = { warnings: evaluator.warnings };
  return { material, warnings: evaluator.warnings };
}
