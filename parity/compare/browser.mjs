/**
 * Shared by the parity harness (run.mjs) and the performance check (perf.mjs): a Vite server for
 * this folder (with the runtime sources and a single copy of three.js) and a Chromium page with
 * WebGPU enabled.
 */
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(dirname(HERE));
const RUNTIME = join(REPO, 'runtime');

// Tooling lives in runtime/node_modules.
const require = createRequire(join(RUNTIME, 'package.json'));
export const load = async (name, key) => {
  const mod = await import(pathToFileURL(require.resolve(name)).href);
  return mod[key] ?? mod.default?.[key];
};

/** Start the server and browser. Returns { base, page, consoleLines, close() }. */
export async function startHarness({ width, height, headed = false }) {
  const chromium = await load('playwright', 'chromium');
  const createServer = await load('vite', 'createServer');
  const three = join(RUNTIME, 'node_modules', 'three');
  const server = await createServer({
    configFile: false,
    root: HERE,
    logLevel: 'warn',
    server: { port: 0, fs: { allow: [REPO] } },
    // No dependency pre-bundling: it could load a second copy of three.js.
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: {
      alias: [
        { find: /^three\/addons\/(.*)$/, replacement: `${three}/examples/jsm/$1` },
        { find: /^three\/webgpu$/, replacement: `${three}/build/three.webgpu.js` },
        { find: /^three\/tsl$/, replacement: `${three}/build/three.tsl.js` },
        { find: /^three$/, replacement: `${three}/build/three.module.js` },
      ],
    },
  });
  await server.listen();
  const base = server.resolvedUrls.local[0];

  const browser = await chromium.launch({
    headless: !headed,
    channel: 'chromium', // full Chromium (new headless) so WebGPU is available
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const consoleLines = [];
  // Include the URL: "Failed to load resource" messages don't name it (e.g. the favicon).
  page.on('console', (msg) => {
    const url = msg.location()?.url;
    consoleLines.push(`[${msg.type()}] ${msg.text()}${url ? ` (${url})` : ''}`);
  });
  const close = async () => {
    await browser.close();
    await server.close();
  };
  return { base, page, consoleLines, close };
}
