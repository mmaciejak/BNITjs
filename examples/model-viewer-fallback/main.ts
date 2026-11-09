/**
 * One asset, two viewers (SPEC §9 Phase 9). painted.glb carries both the node graphs
 * (EXT_blender_shader_graph, not required) and a standard glTF material baked from them.
 *
 * Left: model-viewer, which ignores the extension and shows the baked material. When model-viewer
 * cannot be loaded (offline), three.js's plain GLTFLoader stands in: it reads the same standard
 * material that model-viewer would. Right: three.js with BNITjs, evaluating the graphs live, with
 * the material's live parameters as controls.
 * window.__fallback exposes the state for the automated check.
 */
import {
  Mesh,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
  type Object3D,
} from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  type BakedMaterial,
  bakeMaterial,
  getParams,
  registerBlenderShaderGraph,
} from "../../runtime/src/index.js";

// Pinned: model-viewer bundles its own three.js.
const MODEL_VIEWER = "https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer.min.js";
const ASSET = "./painted.glb";

interface FallbackState {
  ready: boolean;
  error?: string;
  warnings: string[];
  /** Which viewer shows the baked material. */
  baked?: "model-viewer" | "gltfloader";
  /** Base color textures of the baked materials, by material name. */
  bakedTextures: Record<string, boolean>;
  /** Show the live pane through the in-browser bake (bakeMaterial) or live. */
  setInBrowserBake?: (on: boolean) => void;
  /** Set a live parameter of the box's material. */
  setParam?: (name: string, value: number | number[]) => void;
}

declare global {
  interface Window {
    __fallback?: FallbackState;
  }
}

const state: FallbackState = { ready: false, warnings: [], bakedTextures: {} };
window.__fallback = state;
const forceWebGL = new URLSearchParams(location.search).has("webgl");

/** A three.js view in `pane`, lit by a studio environment. */
async function threeView(pane: HTMLElement) {
  const renderer = new WebGPURenderer({ antialias: true, forceWebGL });
  renderer.setPixelRatio(window.devicePixelRatio);
  pane.appendChild(renderer.domElement);
  await renderer.init();
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new PerspectiveCamera(35, 1, 0.05, 50);
  camera.position.set(3.2, 2.4, 3.8);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.45, 0);
  const resize = () => {
    renderer.setSize(pane.clientWidth, pane.clientHeight, false);
    camera.aspect = pane.clientWidth / pane.clientHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  return { scene, renderer };
}

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) found.push(o);
  });
  return found;
}

/** model-viewer, or false when its script cannot be loaded. */
async function modelViewer(pane: HTMLElement): Promise<boolean> {
  try {
    await import(/* @vite-ignore */ MODEL_VIEWER);
  } catch {
    return false;
  }
  const viewer = document.createElement("model-viewer") as HTMLElement & {
    model?: {
      materials: {
        name: string;
        pbrMetallicRoughness: { baseColorTexture: { texture: unknown | null } };
      }[];
    };
  };
  viewer.setAttribute("src", ASSET);
  viewer.setAttribute("camera-controls", "");
  viewer.setAttribute("environment-image", "neutral");
  viewer.setAttribute("camera-orbit", "40deg 70deg auto");
  pane.appendChild(viewer);
  await new Promise<void>((resolve, reject) => {
    viewer.addEventListener("load", () => resolve(), { once: true });
    viewer.addEventListener("error", (e) => reject(new Error(`model-viewer: ${JSON.stringify((e as CustomEvent).detail)}`)), {
      once: true,
    });
  });
  for (const m of viewer.model?.materials ?? []) {
    state.bakedTextures[m.name] = m.pbrMetallicRoughness.baseColorTexture.texture != null;
  }
  return true;
}

/** Without model-viewer: the standard glTF materials through three.js's own loader. */
async function plainLoader(pane: HTMLElement) {
  document.getElementById("baked-title")!.textContent = "three.js GLTFLoader without BNITjs (baked)";
  const { scene } = await threeView(pane);
  const gltf = await new GLTFLoader().loadAsync(ASSET);
  scene.add(gltf.scene);
  for (const mesh of meshes(gltf.scene)) {
    const material = mesh.material as { name: string; map?: unknown };
    state.bakedTextures[material.name] = material.map != null;
  }
}

async function live(pane: HTMLElement) {
  const { scene, renderer } = await threeView(pane);
  const loader = registerBlenderShaderGraph(new GLTFLoader(), {
    onWarning: (w) => state.warnings.push(w),
  });
  const gltf = await loader.loadAsync(ASSET);
  scene.add(gltf.scene);
  const controls = document.getElementById("controls")!;
  // In-browser bake: render each material into textures once (and again when a parameter
  // changes), for devices too slow for the procedural shaders.
  const live = new Map<Mesh, Mesh["material"]>();
  const baked = new Map<Mesh, BakedMaterial>();
  state.setInBrowserBake = (on) => {
    for (const mesh of meshes(gltf.scene)) {
      if (on && !baked.has(mesh)) {
        const result = bakeMaterial(renderer, mesh, { size: 1024, updateOnParamChange: true });
        live.set(mesh, mesh.material);
        baked.set(mesh, result);
        mesh.material = result.material;
      } else if (!on && baked.has(mesh)) {
        mesh.material = live.get(mesh)!;
        baked.get(mesh)!.dispose();
        baked.delete(mesh);
      }
    }
  };
  const toggle = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.addEventListener("change", () => state.setInBrowserBake!(box.checked));
  toggle.append(box, "Bake in browser");
  controls.appendChild(toggle);
  for (const mesh of meshes(gltf.scene)) {
    const params = getParams(mesh.material as never);
    for (const name of params?.names() ?? []) {
      const info = params!.info(name)!;
      const label = document.createElement("label");
      label.textContent = name;
      const input = document.createElement("input");
      if (info.type === "RGBA") {
        input.type = "color";
        const [r, g, b] = (params!.get(name) as number[]).map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255));
        input.value = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        input.addEventListener("input", () => {
          const hex = input.value.slice(1);
          const rgb = [0, 2, 4].map((i) => Math.pow(parseInt(hex.slice(i, i + 2), 16) / 255, 2.2));
          params!.set(name, rgb);
        });
      } else {
        input.type = "range";
        input.min = "0";
        input.max = "1";
        input.step = "0.01";
        input.value = String(params!.get(name));
        input.addEventListener("input", () => params!.set(name, Number(input.value)));
      }
      label.appendChild(input);
      controls.appendChild(label);
    }
    if (params?.names().length) state.setParam = (name, value) => params.set(name, value);
  }
}

async function main() {
  const baked = document.getElementById("baked")!;
  const [hasViewer] = await Promise.all([modelViewer(baked), live(document.getElementById("live")!)]);
  if (hasViewer) state.baked = "model-viewer";
  else {
    await plainLoader(baked);
    state.baked = "gltfloader";
  }
  state.ready = true;
}

main().catch((error: Error) => {
  state.error = error.stack ?? String(error);
  state.ready = true;
});
