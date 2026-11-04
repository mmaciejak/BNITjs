/**
 * Material configurator: loads tiles.glb (made by make_asset.py) and builds a control for every
 * live parameter of its material. window.__configurator exposes the state for the automated check.
 */
import {
  Color,
  PMREMGenerator,
  WebGPURenderer,
  PerspectiveCamera,
  Scene,
  type Mesh,
} from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  getParams,
  registerBlenderShaderGraph,
  type MaterialParams,
} from "../../runtime/src/index.js";

declare global {
  interface Window {
    __configurator?: {
      ready: boolean;
      params?: MaterialParams;
      error?: string;
      render: () => void;
    };
  }
}

const view = document.getElementById("view")!;
// ?webgl forces the WebGL2 backend (used by check.mjs).
const renderer = new WebGPURenderer({
  antialias: true,
  forceWebGL: new URLSearchParams(location.search).has("webgl"),
});
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);
const scene = new Scene();
scene.background = new Color(0x15161a);
const camera = new PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0.6, 4.2);
const controls = new OrbitControls(camera, renderer.domElement);
const render = () => renderer.render(scene, camera);
window.__configurator = { ready: false, render };

function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

const toHex = (rgb: number[]) =>
  `#${new Color(rgb[0], rgb[1], rgb[2]).getHexString()}`; // linear → sRGB hex
const fromHex = (hex: string) => {
  const c = new Color(hex); // sRGB hex → linear working space
  return [c.r, c.g, c.b];
};

function buildControls(params: MaterialParams) {
  const root = document.getElementById("controls")!;
  for (const name of params.names()) {
    const info = params.info(name)!;
    const label = document.createElement("label");
    label.textContent = name.replace(/^.*\//, "");
    const value = params.get(name)!;
    let input: HTMLInputElement;
    if (Array.isArray(value)) {
      input = Object.assign(document.createElement("input"), {
        type: "color",
        value: toHex(value),
      });
      input.addEventListener("input", () =>
        params.set(name, fromHex(input.value)),
      );
    } else {
      const out = document.createElement("output");
      out.textContent = value.toFixed(2);
      label.appendChild(out);
      input = Object.assign(document.createElement("input"), {
        type: "range",
        min: String(info.min ?? 0),
        max: String(info.max ?? 1),
        step: "any",
        value: String(value),
      });
      input.addEventListener("input", () => {
        params.set(name, Number(input.value));
        out.textContent = Number(input.value).toFixed(2);
      });
    }
    input.dataset.param = name;
    root.append(label, input);
  }
}

async function main() {
  await renderer.init();
  resize();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const loader = registerBlenderShaderGraph(new GLTFLoader());
  const gltf = await loader.loadAsync("./tiles.glb");
  scene.add(gltf.scene);
  let params: MaterialParams | undefined;
  gltf.scene.traverse((o) => {
    const material = (o as Mesh).material;
    if (material && !Array.isArray(material)) params ??= getParams(material);
  });
  if (!params) throw new Error("the asset has no live parameters");
  buildControls(params);
  window.__configurator = { ready: true, params, render };
  renderer.setAnimationLoop(() => {
    controls.update();
    render();
  });
}

main().catch((error: Error) => {
  window.__configurator = {
    ready: true,
    error: error.stack ?? String(error),
    render,
  };
  document.getElementById("controls")!.textContent = String(error);
});
