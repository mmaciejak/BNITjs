import type { Scene } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createRegistry } from '../nodes/registry.js';
import { MaterialParams } from '../params/params.js';
import { isClosure } from '../shaders/closures.js';
import type { Vec3Node } from './convert.js';
import { GraphEvaluator } from './evaluate.js';
import { parseGraph } from './parse.js';
import type { BuildOptions } from './build.js';

/** Key of the built world in GLTF.userData (set by the loader plugin). */
export const WORLD_KEY = 'blenderWorld';

/** A Blender World rebuilt from its node graph. */
export interface BlenderWorld {
  name: string;
  /** Linear background color by view direction (Background Color × Strength), or null. */
  background: Vec3Node | null;
  /** Live parameters of the world graph (see material.params). */
  params: MaterialParams;
  warnings: string[];
}

/**
 * Build a World graph (EXT_blender_shader_graph on a glTF scene, `kind: "world"`). Texture
 * coordinates in it are the view direction in Blender's axes, as in Blender's world shaders.
 */
export function buildWorld(graphJson: unknown, options: BuildOptions = {}): BlenderWorld {
  const graph = parseGraph(graphJson);
  const params = new MaterialParams(graph);
  const evaluator = new GraphEvaluator(graph, {
    registry: createRegistry(options.nodes),
    textures: options.textures,
    params,
    onWarning: options.onWarning,
  });
  const surface = evaluator.outputs(graph.output).Surface ?? null;
  let background: Vec3Node | null = null;
  if (isClosure(surface) && surface.kind === 'emission') background = surface.color;
  else if (surface) evaluator.warn('the world Surface is not a Background or Emission shader');
  return { name: graph.material, background, params, warnings: evaluator.warnings };
}

/** The world the loader built for a glTF file, if it had one. */
export function getBlenderWorld(gltf: GLTF): BlenderWorld | undefined {
  return gltf.userData?.[WORLD_KEY] as BlenderWorld | undefined;
}

/**
 * Show the glTF file's Blender World as the scene background (scene.backgroundNode). Returns
 * false when the file has no world. Lighting from the world is not applied: set
 * scene.environment yourself, or bake the background (planned for Phase 9).
 */
export function applyBlenderWorld(scene: Scene, gltf: GLTF): boolean {
  const world = getBlenderWorld(gltf);
  if (!world?.background) return false;
  scene.backgroundNode = world.background;
  return true;
}
