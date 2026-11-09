import { float, output, vec3 } from 'three/tsl';
import type { Texture } from 'three/webgpu';
import type { MaterialParams } from '../params/params.js';
import { type Closure, isClosure } from '../shaders/closures.js';
import {
  constFloat,
  constVec3,
  type FloatNode,
  socketKind,
  toFloat,
  toVec3,
  type Vec3Node,
} from './convert.js';
import { indexLinks, socketKey } from './parse.js';
import type { GraphLink, GraphNode, ShaderGraph, SocketType } from './types.js';

export type NodeOutput = FloatNode | Vec3Node | Closure | null;

/** What a node implementation sees while it builds its TSL. */
export interface NodeContext {
  readonly id: string;
  readonly node: GraphNode;
  readonly graph: ShaderGraph;
  /** Input as float, with Blender's implicit conversion if the link carries another type. */
  float(identifier: string, fallback?: number): FloatNode;
  /** Input as vec3 (vectors and colors). */
  vec3(identifier: string, fallback?: [number, number, number]): Vec3Node;
  /** Shader input, or null when unlinked. */
  shader(identifier: string): Closure | null;
  isLinked(identifier: string): boolean;
  /** Whether any link starts at this node's output `identifier`. */
  isOutputLinked(identifier: string): boolean;
  /** Unlinked value of an input from the graph. */
  inputValue(identifier: string): unknown;
  prop<T>(name: string, fallback: T): T;
  /** The live-parameter uniform driving this node's output, if the node is a parameter. */
  param(): FloatNode | Vec3Node | undefined;
  /** A glTF texture the loader resolved (by index into the glTF textures array). */
  texture(index: number): Texture | undefined;
  warn(message: string): void;
  /**
   * The lit color of a BSDF (Shader to RGB): three.js's lighting result, valid only in the
   * material's outputNode. Null when lit output is off (unlit, or the fallback pass of
   * buildMaterial) or another BSDF already claimed it.
   */
  litOutput(closure: Closure): { color: Vec3Node; alpha: FloatNode } | null;
}

/** Builds the outputs of one Blender node type, keyed by output socket identifier. */
export type NodeImpl = (ctx: NodeContext) => Record<string, NodeOutput>;

export type NodeRegistry = ReadonlyMap<string, NodeImpl>;

export interface EvaluateOptions {
  registry: NodeRegistry;
  textures?: ReadonlyMap<number, Texture>;
  params?: MaterialParams;
  onWarning?: (message: string) => void;
  /** Whether Shader to RGB may use the lit output of a BSDF (default true). */
  litOutput?: boolean;
}

/** Walks a graph from its output and builds TSL for every node it reaches (memoized). */
export class GraphEvaluator {
  readonly warnings: string[] = [];
  /** The BSDF whose lit color Shader to RGB uses, if any. */
  litSource: Closure | null = null;
  private readonly links: Map<string, GraphLink>;
  private readonly cache = new Map<string, Record<string, NodeOutput>>();
  private readonly building = new Set<string>();

  constructor(
    readonly graph: ShaderGraph,
    private readonly options: EvaluateOptions,
  ) {
    this.links = indexLinks(graph.links);
  }

  warn(message: string): void {
    if (this.warnings.includes(message)) return;
    this.warnings.push(message);
    this.options.onWarning?.(message);
  }

  /** Outputs of a node, building it on first use. */
  outputs(id: string): Record<string, NodeOutput> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const node = this.graph.nodes[id];
    if (!node) {
      this.warn(`missing node "${id}"`);
      return {};
    }
    if (this.building.has(id)) {
      this.warn(`cycle through node "${id}"`);
      return fallbackOutputs(node);
    }
    this.building.add(id);
    let result: Record<string, NodeOutput>;
    const impl = this.options.registry.get(node.type);
    if (!impl) {
      this.warn(`${node.type} ("${id}") is not supported yet; using a default value`);
      result = fallbackOutputs(node);
    } else {
      try {
        result = impl(this.context(id, node));
      } catch (error) {
        this.warn(`${node.type} ("${id}") failed: ${(error as Error).message}`);
        result = fallbackOutputs(node);
      }
    }
    this.building.delete(id);
    this.cache.set(id, result);
    return result;
  }

  /** The value feeding an input, with the type of the socket it comes from. */
  private source(id: string, identifier: string): { value: NodeOutput; type: SocketType } | null {
    const link = this.links.get(socketKey(id, identifier));
    if (!link) return null;
    const [fromId, fromSocket] = link.from;
    const type = this.graph.nodes[fromId]?.outputs?.[fromSocket]?.type ?? 'VALUE';
    const value = this.outputs(fromId)[fromSocket];
    if (value === undefined) {
      this.warn(`node "${fromId}" did not produce output "${fromSocket}"`);
      return null;
    }
    return { value, type };
  }

  private context(id: string, node: GraphNode): NodeContext {
    const inputValue = (identifier: string) => node.inputs?.[identifier]?.value;
    return {
      id,
      node,
      graph: this.graph,
      float: (identifier, fallback = 0) => {
        const src = this.source(id, identifier);
        if (src && src.value !== null && !isClosure(src.value)) return toFloat(src.value, src.type);
        return constFloat(inputValue(identifier), fallback);
      },
      vec3: (identifier, fallback = [0, 0, 0]) => {
        const src = this.source(id, identifier);
        if (src && src.value !== null && !isClosure(src.value)) return toVec3(src.value, src.type);
        return constVec3(inputValue(identifier), fallback);
      },
      shader: (identifier) => {
        const src = this.source(id, identifier);
        if (!src) return null;
        if (src.value !== null && isClosure(src.value)) return src.value;
        if (src.value !== null) {
          this.warn(`non-shader value linked into shader input "${identifier}" of "${id}"`);
        }
        return null;
      },
      isLinked: (identifier) => this.links.has(socketKey(id, identifier)),
      isOutputLinked: (identifier) =>
        (this.graph.links ?? []).some((l) => l.from[0] === id && l.from[1] === identifier),
      inputValue,
      prop: <T>(name: string, fallback: T): T => {
        const value = node.properties?.[name];
        return value === undefined ? fallback : (value as T);
      },
      param: () => this.options.params?.nodeFor(id),
      texture: (index) => this.options.textures?.get(index),
      warn: (message) => this.warn(`${node.type} ("${id}"): ${message}`),
      litOutput: (closure) => {
        if (this.options.litOutput === false) return null;
        if (this.litSource && this.litSource !== closure) return null;
        this.litSource = closure;
        return { color: output.rgb as Vec3Node, alpha: output.a as FloatNode };
      },
    };
  }
}

/** Zero of each output type; shader outputs give no closure (renders like an unlinked surface). */
export function fallbackOutputs(node: GraphNode): Record<string, NodeOutput> {
  const result: Record<string, NodeOutput> = {};
  for (const [identifier, socket] of Object.entries(node.outputs ?? {})) {
    const kind = socketKind(socket.type);
    result[identifier] = kind === 'float' ? float(0) : kind === 'vec3' ? vec3(0) : null;
  }
  return result;
}
