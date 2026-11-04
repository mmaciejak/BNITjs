/**
 * Browser side of the performance check: renders out/perf_<case>/scene.gltf full-frame and times
 * frames for each value of the "$Detail" live parameter. Reports through window.__perf.
 * Query: ?case=<name>&size=2048&frames=40&details=0,2,4[&webgl]
 */
import {
  type Camera,
  type Mesh,
  NoToneMapping,
  SRGBColorSpace,
  WebGPURenderer,
} from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  getParams,
  registerBlenderShaderGraph,
} from "../../runtime/src/index.js";

interface PerfState {
  done: boolean;
  error?: string;
  backend?: string;
  /** Milliseconds per frame, by Detail (or "-" when the case has no $Detail). */
  frameMs: Record<string, number>;
}

declare global {
  interface Window {
    __perf: PerfState;
  }
}

const state: PerfState = { done: false, frameMs: {} };
window.__perf = state;

async function main() {
  const params = new URLSearchParams(location.search);
  const name = params.get("case");
  if (!name) throw new Error("missing ?case=");
  const size = Number(params.get("size") ?? 2048);
  const frames = Number(params.get("frames") ?? 40);
  const details = (params.get("details") ?? "2").split(",").map(Number);

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
  const backend = renderer.backend as {
    isWebGPUBackend?: boolean;
    device?: GPUDevice;
    gl?: WebGL2RenderingContext;
  };
  state.backend = backend.isWebGPUBackend ? "webgpu" : "webgl2";

  /** Wait until the GPU has finished every frame submitted so far. */
  const finish = async () => {
    if (backend.device) await backend.device.queue.onSubmittedWorkDone();
    else if (backend.gl) {
      const pixel = new Uint8Array(4);
      backend.gl.readPixels(0, 0, 1, 1, backend.gl.RGBA, backend.gl.UNSIGNED_BYTE, pixel);
    }
  };

  const loader = registerBlenderShaderGraph(new GLTFLoader(), { unlit: true });
  const gltf = await loader.loadAsync(`./out/perf_${name}/scene.gltf`);
  const camera = gltf.cameras[0] as Camera | undefined;
  if (!camera) throw new Error("scene has no camera");
  gltf.scene.updateMatrixWorld(true);
  let material: Parameters<typeof getParams>[0] | undefined;
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh) material = (o as Mesh).material as typeof material;
  });
  const live = material ? getParams(material) : undefined;
  const hasDetail = live?.names().includes("Detail") ?? false;

  for (const detail of hasDetail ? details : [NaN]) {
    if (hasDetail) live!.set("Detail", detail);
    // Warm-up: the first frame compiles the pipeline.
    for (let i = 0; i < 3; i++) renderer.render(gltf.scene, camera);
    await finish();
    const start = performance.now();
    for (let i = 0; i < frames; i++) renderer.render(gltf.scene, camera);
    await finish();
    state.frameMs[hasDetail ? String(detail) : "-"] =
      (performance.now() - start) / frames;
  }
  state.done = true;
}

main().catch((error: Error) => {
  state.error = error.stack ?? String(error);
  state.done = true;
});
