/**
 * Browser side of the parity harness: renders out/<scene>/scene.gltf unlit with the runtime and
 * reports through window.__parity. Query: ?scene=<name>&size=512&ss=4[&webgl][&bake=<size>]
 * (bake: render each material through bakeMaterial() at that texture size).
 */
import {
  Mesh,
  NoToneMapping,
  SRGBColorSpace,
  Scene,
  WebGPURenderer,
  type Camera,
} from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  applyBlenderWorld,
  bakeMaterial,
  registerBlenderShaderGraph,
} from "../../runtime/src/index.js";

interface ParityState {
  done: boolean;
  error?: string;
  backend?: string;
  warnings: string[];
}

declare global {
  interface Window {
    __parity: ParityState;
  }
}

const state: ParityState = { done: false, warnings: [] };
window.__parity = state;

async function main() {
  const params = new URLSearchParams(location.search);
  const scene = params.get("scene");
  if (!scene) throw new Error("missing ?scene=");
  const size =
    Number(params.get("size") ?? 512) * Number(params.get("ss") ?? 4);

  const renderer = new WebGPURenderer({
    antialias: false,
    forceWebGL: params.has("webgl"),
  });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  const backend = renderer.backend as { isWebGPUBackend?: boolean };
  state.backend = backend.isWebGPUBackend ? "webgpu" : "webgl2";

  const loader = registerBlenderShaderGraph(new GLTFLoader(), {
    unlit: true,
    onWarning: (w) => state.warnings.push(w),
  });
  const gltf = await loader.loadAsync(`./out/${scene}/scene.gltf`);
  const camera = gltf.cameras[0] as Camera | undefined;
  if (!camera) throw new Error("scene has no camera");
  // A Scene (not the glTF Group) so the file's World can be the background.
  const root = new Scene();
  root.add(gltf.scene);
  applyBlenderWorld(root, gltf);
  root.updateMatrixWorld(true);
  const bake = params.get("bake");
  if (bake) {
    const meshes: Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof Mesh) meshes.push(o);
    });
    for (const mesh of meshes) {
      mesh.material = bakeMaterial(renderer, mesh, { size: Number(bake) }).material;
    }
  }
  renderer.render(root, camera);
  // Let the frame reach the canvas before the harness captures it.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  state.done = true;
}

main().catch((error: Error) => {
  state.error = error.stack ?? String(error);
  state.done = true;
});
