import { uniform } from 'three/tsl';
import { Color, Vector3, type NodeMaterial } from 'three/webgpu';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import { socketKind } from '../graph/convert.js';
import type { ShaderGraph, SocketType, Value } from '../graph/types.js';

export interface ParamInfo {
  name: string;
  /** Blender socket type: VALUE, INT, BOOLEAN (numbers) or RGBA, VECTOR (3 numbers). */
  type: SocketType;
  default: number | number[];
  min?: number;
  max?: number;
}

type Uniform = ReturnType<typeof uniform>;

interface Entry {
  info: ParamInfo;
  uniform: Uniform;
  node: string;
}

/**
 * Live parameters of one material (SPEC §9 Phase 3). Values are uniforms, so set() takes
 * effect on the next frame without rebuilding the material.
 *
 *   material.params.set('Grain Scale', 4);
 *   material.params.set('Wood/Shade', [0.6, 0.3, 0.1]);   // linear RGB, like Blender
 */
export class MaterialParams {
  private readonly entries = new Map<string, Entry>();

  /** Parameters declared by the graph ("$" labels in Blender). */
  constructor(graph: ShaderGraph) {
    for (const p of graph.params ?? []) {
      const kind = socketKind(p.type);
      if (kind !== 'float' && kind !== 'vec3') continue;
      const def = toDefault(p.default, kind);
      const [x = 0, y = 0, z = 0] = Array.isArray(def) ? def : [];
      let u: Uniform;
      if (kind === 'float') u = uniform(def as number);
      else if (p.type === 'RGBA') u = uniform(new Color(x, y, z)) as unknown as Uniform;
      else u = uniform(new Vector3(x, y, z)) as unknown as Uniform;
      this.entries.set(p.name, {
        info: { name: p.name, type: p.type, default: def, min: p.min, max: p.max },
        uniform: u,
        node: p.node,
      });
    }
  }

  /** Parameter names, in graph order. */
  names(): string[] {
    return [...this.entries.keys()];
  }

  info(name: string): ParamInfo | undefined {
    return this.entries.get(name)?.info;
  }

  get(name: string): number | number[] | undefined {
    const value = this.entries.get(name)?.uniform.value as number | Color | Vector3 | undefined;
    if (value === undefined) return undefined;
    if (typeof value === 'number') return value;
    return value instanceof Color ? [value.r, value.g, value.b] : [value.x, value.y, value.z];
  }

  /** Set a parameter. Numbers for VALUE/INT/BOOLEAN; [r, g, b] (linear) or a Color for RGBA. */
  set(name: string, value: number | number[] | Color): this {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`unknown parameter "${name}" (have: ${this.names().join(', ')})`);
    const current = entry.uniform.value as number | Color | Vector3;
    if (typeof current === 'number') {
      if (typeof value !== 'number') throw new TypeError(`parameter "${name}" takes a number`);
      entry.uniform.value = value;
    } else if (value instanceof Color) {
      (current as Color | Vector3 as Color).copy?.(value);
    } else if (Array.isArray(value)) {
      const [x = 0, y = 0, z = 0] = value;
      if (current instanceof Color) current.setRGB(x, y, z);
      else current.set(x, y, z);
    } else {
      throw new TypeError(`parameter "${name}" takes [r, g, b]`);
    }
    return this;
  }

  reset(): this {
    for (const [name, entry] of this.entries) this.set(name, entry.info.default);
    return this;
  }

  /** The uniform driving node `nodeId`'s output, if that node is a parameter. */
  nodeFor(nodeId: string): FloatNode | Vec3Node | undefined {
    for (const entry of this.entries.values()) {
      if (entry.node === nodeId) return entry.uniform as unknown as FloatNode | Vec3Node;
    }
    return undefined;
  }
}

function toDefault(value: Value | undefined, kind: 'float' | 'vec3'): number | number[] {
  if (kind === 'float') {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return 0;
  }
  if (Array.isArray(value)) return value.slice(0, 3).map((v) => (typeof v === 'number' ? v : 0));
  return [0, 0, 0];
}

/** A node material built from a Blender graph, with its live parameters. */
export type BlenderShaderMaterial = NodeMaterial & { params: MaterialParams };

/*
 * Material.clone() (GLTFLoader clones most materials in assignFinalMaterial) copies userData as
 * JSON but not custom properties, so params are also found through an id kept in userData.
 * Clones share the uniform nodes, so one MaterialParams drives the original and every clone.
 */
const registry = new Map<string, MaterialParams>();
let nextId = 0;

/** Register params for a material; returns the id stored in userData.blenderShaderGraph.params. */
export function registerParams(params: MaterialParams): string {
  const id = `bsw-params-${nextId++}`;
  registry.set(id, params);
  return id;
}

interface WithParams {
  params?: unknown;
  userData?: { blenderShaderGraph?: { params?: string } };
}

/** The live parameters of a material built by this library (or a clone of one), or undefined. */
export function getParams(material: WithParams): MaterialParams | undefined {
  if (material.params instanceof MaterialParams) return material.params;
  const id = material.userData?.blenderShaderGraph?.params;
  return id ? registry.get(id) : undefined;
}

/** Give a cloned material its `params` property back. */
export function restoreParams(material: WithParams): void {
  const params = getParams(material);
  if (params && material.params !== params) material.params = params;
}
