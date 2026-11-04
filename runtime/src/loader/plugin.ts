import { DoubleSide, type Material, type Object3D, type Texture } from 'three/webgpu';
import type {
  GLTF,
  GLTFLoader,
  GLTFLoaderPlugin,
  GLTFParser,
} from 'three/addons/loaders/GLTFLoader.js';
import { buildMaterial, type BuildOptions, textureIndices } from '../graph/build.js';
import { restoreParams } from '../params/params.js';
import {
  type ColorAttributes,
  EXTENSION_NAME,
  type ObjectExtension,
  USERDATA_KEY,
} from '../graph/types.js';

export type LoaderOptions = BuildOptions;

interface MaterialDef {
  name?: string;
  doubleSided?: boolean;
  extensions?: Record<string, unknown>;
}

interface NodeDef {
  extensions?: Record<string, unknown>;
}

/**
 * GLTFLoader plugin: materials carrying EXT_blender_shader_graph are rebuilt from their node
 * graph; the standard glTF material in the same file is used when building fails.
 */
export class BlenderShaderGraphPlugin implements GLTFLoaderPlugin {
  readonly name = EXTENSION_NAME;

  constructor(
    private readonly parser: GLTFParser,
    private readonly options: LoaderOptions = {},
  ) {}

  loadMaterial(materialIndex: number): Promise<Material> | null {
    const def = (this.parser.json.materials as MaterialDef[] | undefined)?.[materialIndex];
    const graph = def?.extensions?.[EXTENSION_NAME];
    if (!def || !graph) return null;
    return this.buildMaterial(materialIndex, def, graph);
  }

  private async buildMaterial(
    materialIndex: number,
    def: MaterialDef,
    graph: unknown,
  ): Promise<Material> {
    const warn = (message: string) => {
      const text = `[${EXTENSION_NAME}] ${def.name ?? `material ${materialIndex}`}: ${message}`;
      if (this.options.onWarning) this.options.onWarning(text);
      else console.warn(text);
    };
    try {
      const textures = new Map<number, Texture>();
      for (const index of textureIndices(graph)) {
        textures.set(index, (await this.parser.getDependency('texture', index)) as Texture);
      }
      const colorAttributes = this.colorAttributesFor(materialIndex);
      const input = colorAttributes ? { ...(graph as object), colorAttributes } : graph;
      const { material } = buildMaterial(input, { ...this.options, textures, onWarning: warn });
      if (def.name) material.name = def.name;
      if (def.doubleSided) material.side = DoubleSide;
      return material;
    } catch (error) {
      warn(`falling back to the standard glTF material: ${(error as Error).message}`);
      return (await this.parser.loadMaterial(materialIndex)) as Material;
    }
  }

  /** Color attribute layout of the first object that uses the material (see exporter). */
  private colorAttributesFor(materialIndex: number): ColorAttributes | undefined {
    const json = this.parser.json as {
      nodes?: (NodeDef & { mesh?: number })[];
      meshes?: { primitives: { material?: number }[] }[];
    };
    for (const node of json.nodes ?? []) {
      if (node.mesh === undefined) continue;
      const usesMaterial = json.meshes?.[node.mesh]?.primitives.some(
        (p) => p.material === materialIndex,
      );
      const data = node.extensions?.[EXTENSION_NAME] as ObjectExtension | undefined;
      if (usesMaterial && data?.object.colorAttributes) return data.object.colorAttributes;
    }
    return undefined;
  }

  /** Store per-object data (Object Info, Generated coordinates) on the objects that use it. */
  afterRoot(result: GLTF): Promise<void> | null {
    const nodes = (this.parser.json.nodes as NodeDef[] | undefined) ?? [];
    const associations = this.parser.associations as Map<Object3D, { nodes?: number } | undefined>;
    for (const [object, mapping] of associations) {
      if (mapping?.nodes === undefined) continue;
      const data = nodes[mapping.nodes]?.extensions?.[EXTENSION_NAME] as
        ObjectExtension | undefined;
      if (!data) continue;
      object.userData[USERDATA_KEY] = data;
      // Multi-primitive meshes: the glTF node becomes a Group of Meshes.
      for (const child of object.children) {
        if (associations.get(child)?.nodes === undefined) child.userData[USERDATA_KEY] = data;
      }
    }
    // GLTFLoader clones most materials; give the clones their params back.
    result.scene.traverse((object) => {
      const material = (object as { material?: Material | Material[] }).material;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        restoreParams(m as Parameters<typeof restoreParams>[0]);
      }
    });
    return null;
  }
}

/** Register the plugin on a GLTFLoader. */
export function registerBlenderShaderGraph(
  loader: GLTFLoader,
  options: LoaderOptions = {},
): GLTFLoader {
  return loader.register((parser) => new BlenderShaderGraphPlugin(parser, options));
}
