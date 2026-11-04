/**
 * blender-shader-web runtime: rebuilds Blender shader node graphs (exported by the add-on in
 * /exporter) as three.js TSL node materials.
 *
 *   const loader = registerBlenderShaderGraph(new GLTFLoader());
 *   const gltf = await loader.loadAsync('model.glb');
 */

export { buildMaterial, type BuildOptions, type BuildResult } from './graph/build.js';
export type { NodeContext, NodeImpl, NodeOutput, NodeRegistry } from './graph/evaluate.js';
export { GraphFormatError, parseGraph } from './graph/parse.js';
export {
  EXTENSION_NAME,
  GRAPH_FORMAT_VERSION,
  type ObjectData,
  type ShaderGraph,
  USERDATA_KEY,
} from './graph/types.js';
export {
  BlenderShaderGraphPlugin,
  type LoaderOptions,
  registerBlenderShaderGraph,
} from './loader/plugin.js';
export { builtinNodes, createRegistry } from './nodes/registry.js';
export type { Closure } from './shaders/closures.js';
