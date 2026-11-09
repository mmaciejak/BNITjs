/**
 * In-browser bake (SPEC §9 Phase 9): render a material's procedural inputs into textures once,
 * so a weak device samples a few textures per pixel instead of evaluating the node graph.
 *
 *   const baked = bakeMaterial(renderer, mesh, { size: 1024 });
 *   mesh.material = baked.material;
 *   params.set('Grain Scale', 4); baked.update();   // or { updateOnParamChange: true }
 *
 * Each input is rendered in the mesh's UV space (the "uv" attribute, TEXCOORD_0): the mesh is
 * drawn with its vertices placed at their UVs, and the fragment shader evaluates the input as it
 * would on the surface. Inputs that depend on the view (Incoming, Fresnel, Layer Weight, Camera
 * Data, Window coordinates) are baked as seen from a camera at the world origin. The UV layout
 * must not overlap; texels outside the UV islands are filled from their neighbours (dilation) so
 * that filtering does not pull in the background at seams.
 */
import {
  clamp,
  float,
  Fn,
  If,
  ivec2,
  modelWorldMatrix,
  textureLoad,
  texture as textureNode,
  transformNormalToView,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  OrthographicCamera,
  Color,
  DoubleSide,
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  type Node,
  type NodeMaterial,
  QuadMesh,
  RenderTarget,
  RGBAFormat,
  Scene,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import { getParams } from '../params/params.js';

/** Material inputs that can be baked, by NodeMaterial property. */
export const BAKE_SLOTS = [
  'colorNode',
  'opacityNode',
  'roughnessNode',
  'metalnessNode',
  'emissiveNode',
  'normalNode',
] as const;
export type BakeSlot = (typeof BAKE_SLOTS)[number];

export interface BakeOptions {
  /** Width and height of each baked texture (default 1024). */
  size?: number;
  /** Inputs to bake (default: every one of BAKE_SLOTS the material sets). Others stay live. */
  slots?: BakeSlot[];
  /** Texels to grow the UV islands by (default 4). */
  dilate?: number;
  /** Bake again whenever one of the material's live parameters changes (default false). */
  updateOnParamChange?: boolean;
}

export interface BakedMaterial {
  /** A copy of the material whose baked inputs sample textures. */
  material: NodeMaterial;
  /** The baked textures, by input. */
  textures: Partial<Record<BakeSlot, Texture>>;
  /** Bake again (after changing live parameters). */
  update(): void;
  /** Free the textures and stop listening to parameter changes. */
  dispose(): void;
}

type AnyNode = Node;

/** The value an input writes, as rgb (normals: object space). */
function bakeValue(slot: BakeSlot, node: AnyNode): Node<'vec3'> {
  if (slot === 'normalNode') {
    // normalNode is in view space; the bake camera sits at the origin, so view = world. The object
    // normal is Mᵀ·n (the inverse of the normal matrix M⁻ᵀ), renormalized.
    const world = vec3(node as Node<'vec3'>);
    return modelWorldMatrix.transpose().mul(vec4(world, 0)).xyz.normalize();
  }
  return vec3(node as Node<'vec3'>);
}

/** The node sampling a baked input in place of the original. */
function sampleValue(slot: BakeSlot, tex: Texture): AnyNode {
  const value = textureNode(tex, uv());
  if (slot === 'normalNode') return transformNormalToView(value.xyz.normalize());
  if (slot === 'colorNode' || slot === 'emissiveNode') return value.xyz;
  return value.x;
}

function makeTarget(size: number): RenderTarget {
  const target = new RenderTarget(size, size, {
    type: HalfFloatType,
    format: RGBAFormat,
    depthBuffer: false,
    generateMipmaps: false,
  });
  target.texture.minFilter = LinearFilter;
  target.texture.magFilter = LinearFilter;
  return target;
}

/**
 * Grow the islands of `source` (alpha 1 inside, 0 outside) by one texel: an empty texel takes the
 * mean of its covered neighbours.
 */
function dilateMaterial(source: Texture, size: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.fragmentNode = Fn(() => {
    const p = uv().mul(size).floor();
    const center = textureLoad(source, ivec2(p)).toVar();
    If(center.w.lessThan(0.5), () => {
      const sum = vec4(0).toVar();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const t = textureLoad(source, ivec2(clamp(p.add(vec2(dx, dy)), 0, size - 1)));
          sum.addAssign(vec4(t.xyz.mul(t.w), t.w));
        }
      }
      If(sum.w.greaterThan(0), () => {
        center.assign(vec4(sum.xyz.div(sum.w), 1));
      });
    });
    return center;
  })();
  material.toneMapped = false;
  material.blending = NoBlending;
  return material;
}

/** Bake `mesh`'s node material (built by this library or any NodeMaterial) into textures. */
export function bakeMaterial(
  renderer: WebGPURenderer,
  mesh: Mesh,
  options: BakeOptions = {},
): BakedMaterial {
  const source = mesh.material as NodeMaterial;
  if (Array.isArray(source))
    throw new Error('bakeMaterial: meshes with several materials are not supported');
  if (!mesh.geometry.getAttribute('uv'))
    throw new Error('bakeMaterial: the mesh has no "uv" attribute');
  const size = options.size ?? 1024;
  const record = source as unknown as Record<BakeSlot, AnyNode | null>;
  const slots = (options.slots ?? [...BAKE_SLOTS]).filter((slot) => record[slot]);

  // The mesh, drawn at its UVs: clip = (2u − 1, 2v − 1). Every triangle is drawn, whichever way
  // it faces in UV space.
  const bakeMaterialFor = (slot: BakeSlot) => {
    const m = new MeshBasicNodeMaterial();
    m.side = DoubleSide;
    m.toneMapped = false;
    m.blending = NoBlending;
    m.vertexNode = vec4(uv().x.mul(2).sub(1), float(1).sub(uv().y.mul(2)), 0, 1);
    m.fragmentNode = vec4(bakeValue(slot, record[slot] as AnyNode), 1);
    return m;
  };
  const bakeMesh = new Mesh(mesh.geometry);
  bakeMesh.userData = mesh.userData;
  bakeMesh.frustumCulled = false;
  bakeMesh.matrixAutoUpdate = false;
  const scene = new Scene();
  scene.add(bakeMesh);
  const camera = new OrthographicCamera(); // at the origin: view space = world space

  const targets = new Map<BakeSlot, RenderTarget>();
  const materials = new Map<BakeSlot, MeshBasicNodeMaterial>();
  for (const slot of slots) {
    targets.set(slot, makeTarget(size));
    materials.set(slot, bakeMaterialFor(slot));
  }
  const scratch = makeTarget(size);
  const quad = new QuadMesh(new MeshBasicNodeMaterial());
  const dilate = options.dilate ?? 4;
  const passes = dilate + (dilate % 2);
  const dilateFrom = new Map<Texture, MeshBasicNodeMaterial>();
  const dilation = (tex: Texture) => {
    let m = dilateFrom.get(tex);
    if (!m) dilateFrom.set(tex, (m = dilateMaterial(tex, size)));
    return m;
  };

  const update = () => {
    const previous = renderer.getRenderTarget();
    const clearColor = renderer.getClearColor(new Color());
    const clearAlpha = renderer.getClearAlpha();
    mesh.updateWorldMatrix(true, false);
    // With matrixAutoUpdate off, the renderer sets matrixWorld from matrix (no parent).
    bakeMesh.matrix.copy(mesh.matrixWorld);
    bakeMesh.matrixWorld.copy(mesh.matrixWorld);
    for (const slot of slots) {
      const target = targets.get(slot)!;
      bakeMesh.material = materials.get(slot)!;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      // Ping-pong between the target and the scratch target. An even number of passes ends in the
      // target (and cancels any flip between how the quad's uv and textureLoad index rows).
      for (let i = 0; i < passes; i++) {
        const [from, to] = i % 2 === 0 ? [target, scratch] : [scratch, target];
        quad.material = dilation(from.texture);
        renderer.setRenderTarget(to);
        quad.render(renderer);
      }
    }
    renderer.setRenderTarget(previous);
    renderer.setClearColor(clearColor, clearAlpha);
  };
  update();

  const material = source.clone() as NodeMaterial;
  const textures: Partial<Record<BakeSlot, Texture>> = {};
  for (const slot of slots) {
    const tex = targets.get(slot)!.texture;
    textures[slot] = tex;
    (material as unknown as Record<BakeSlot, AnyNode>)[slot] = sampleValue(slot, tex);
  }
  material.userData = { ...source.userData, bakedFrom: source.uuid };

  const params = getParams(source);
  const unsubscribe =
    options.updateOnParamChange && params ? params.onChange(() => update()) : () => {};

  return {
    material,
    textures,
    update,
    dispose() {
      unsubscribe();
      for (const target of targets.values()) target.dispose();
      scratch.dispose();
      for (const m of materials.values()) m.dispose();
      for (const m of dilateFrom.values()) m.dispose();
    },
  };
}
