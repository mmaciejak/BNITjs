/**
 * Product materials: Principled BSDF materials using the physical extras (coat, transmission,
 * sheen, thin film, anisotropy, specular level and tint) under the file's baked Sky World.
 * window.__materials exposes the state for the automated check.
 */
import { PMREMGenerator, PerspectiveCamera, Scene, WebGPURenderer } from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  applyBlenderWorld,
  registerBlenderShaderGraph,
} from "../../runtime/src/index.js";

declare global {
  interface Window {
    __materials?: { ready: boolean; error?: string; warnings: string[] };
  }
}

const state: NonNullable<Window["__materials"]> = { ready: false, warnings: [] };
window.__materials = state;

const view = document.getElementById("view")!;
// ?webgl forces the WebGL2 backend (used by check.mjs).
const renderer = new WebGPURenderer({
  antialias: true,
  forceWebGL: new URLSearchParams(location.search).has("webgl"),
});
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);
const scene = new Scene();
const camera = new PerspectiveCamera(30, 1, 0.1, 100);
// glTF is Y-up: Blender's X stays X, Blender's Z is Y.
camera.position.set(0, 1.2, 9);
const controls = new OrbitControls(camera, renderer.domElement);

function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

async function main() {
  await renderer.init();
  resize();
  // The World is shown as the background but does not light the scene yet: light it with a
  // generic studio environment.
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const loader = registerBlenderShaderGraph(new GLTFLoader(), {
    onWarning: (w) => state.warnings.push(w),
  });
  const gltf = await loader.loadAsync("./materials.glb");
  scene.add(gltf.scene);
  applyBlenderWorld(scene, gltf);
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  state.ready = true;
}

main().catch((error: Error) => {
  state.error = error.stack ?? String(error);
  state.ready = true;
});
