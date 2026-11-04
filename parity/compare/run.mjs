/**
 * Parity harness, browser side (SPEC §6).
 *
 *   cd runtime && npm run parity -- [scene ...] [--webgl] [--headed]
 *
 * For every scene that has a reference in parity/references/ (made by parity/render_refs.py),
 * renders parity/compare/out/<scene>/scene.gltf in headless Chromium at SS× resolution,
 * box-downsamples in linear space (like Cycles' box pixel filter), and compares with the
 * Blender reference. Writes browser.png / diff.png per scene and report.{md,json}; exits 1 if a
 * scene exceeds its thresholds (parity/thresholds.json): the mean error must be ≤ mae, and at
 * most a fraction `outliers` (default 0) of pixels may have a channel error above max.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PARITY = dirname(HERE);
const REPO = dirname(PARITY);
const RUNTIME = join(REPO, 'runtime');
const OUT = join(HERE, 'out');
const REFS = join(PARITY, 'references');
const SS = 4;

// Tooling lives in runtime/node_modules.
const require = createRequire(join(RUNTIME, 'package.json'));
const load = async (name, key) => {
  const mod = await import(pathToFileURL(require.resolve(name)).href);
  return mod[key] ?? mod.default?.[key];
};
const chromium = await load('playwright', 'chromium');
const PNG = await load('pngjs', 'PNG');
const createServer = await load('vite', 'createServer');

const args = process.argv.slice(2);
const useWebGL = args.includes('--webgl');
const headed = args.includes('--headed');
const wanted = args.filter((a) => !a.startsWith('--'));

const thresholds = JSON.parse(readFileSync(join(PARITY, 'thresholds.json'), 'utf8'));
const scenes = readdirSync(REFS)
  .filter((f) => f.endsWith('.png'))
  .map((f) => f.slice(0, -4))
  .filter((name) => wanted.length === 0 || wanted.some((w) => name === w || name.startsWith(`${w}_`)))
  .sort();
if (scenes.length === 0) {
  console.error('No references. Run: blender -b --factory-startup --python parity/render_refs.py');
  process.exit(1);
}

// --- color helpers ----------------------------------------------------------------------------
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** RGB floats (0-1 sRGB) from a PNG; 8- and 16-bit. */
function readPng(buffer) {
  const png = PNG.sync.read(buffer, { skipRescale: true });
  const max = png.depth === 16 ? 65535 : 255;
  const rgb = new Float64Array(png.width * png.height * 3);
  for (let i = 0; i < png.width * png.height; i++) {
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = png.data[i * 4 + c] / max;
  }
  return { width: png.width, height: png.height, rgb };
}

/** Box-downsample an sRGB image by `factor`, averaging in linear light. */
function downsample(img, factor) {
  const w = img.width / factor;
  const h = img.height / factor;
  const rgb = new Float64Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            sum += srgbToLinear(img.rgb[((y * factor + dy) * img.width + x * factor + dx) * 3 + c]);
          }
        }
        rgb[(y * w + x) * 3 + c] = linearToSrgb(sum / (factor * factor));
      }
    }
  }
  return { width: w, height: h, rgb };
}

function writePng(path, img, map = (v) => v) {
  const png = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.width * img.height; i++) {
    for (let c = 0; c < 3; c++) {
      png.data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(map(img.rgb[i * 3 + c]) * 255)));
    }
    png.data[i * 4 + 3] = 255;
  }
  writeFileSync(path, PNG.sync.write(png));
}

/** Errors in 8-bit levels on sRGB-encoded values. */
function compare(ref, got) {
  if (ref.width !== got.width || ref.height !== got.height) {
    throw new Error(`size mismatch: reference ${ref.width}×${ref.height}, browser ${got.width}×${got.height}`);
  }
  const diff = new Float64Array(ref.rgb.length);
  const pixelMax = new Float64Array(ref.width * ref.height);
  let sum = 0;
  let max = 0;
  for (let i = 0; i < ref.rgb.length; i++) {
    const d = Math.abs(ref.rgb[i] - got.rgb[i]) * 255;
    diff[i] = d;
    sum += d;
    if (d > max) max = d;
    const p = (i / 3) | 0;
    if (d > pixelMax[p]) pixelMax[p] = d;
  }
  /** Fraction of pixels whose worst channel exceeds `level`. */
  const over = (level) => pixelMax.reduce((n, d) => n + (d > level ? 1 : 0), 0) / pixelMax.length;
  return { mae: sum / ref.rgb.length, max, over, diff: { width: ref.width, height: ref.height, rgb: diff } };
}

// --- run ---------------------------------------------------------------------------------------
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
const page = await browser.newPage({ viewport: { width: 512 * SS, height: 512 * SS }, deviceScaleFactor: 1 });
const consoleLines = [];
page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));

const results = [];
let failed = 0;
for (const name of scenes) {
  const dir = join(OUT, name);
  const limit = { ...thresholds.default, ...(thresholds.scenes[name] ?? {}) };
  const result = { scene: name, limit };
  try {
    if (!existsSync(join(dir, 'scene.gltf'))) throw new Error('missing out/<scene>/scene.gltf; rerun render_refs.py');
    const ref = readPng(readFileSync(join(REFS, `${name}.png`)));
    consoleLines.length = 0;
    await page.goto(`${base}index.html?scene=${encodeURIComponent(name)}&size=${ref.width}&ss=${SS}${useWebGL ? '&webgl' : ''}`);
    await page.waitForFunction(() => window.__parity?.done, null, { timeout: 120_000 });
    const state = await page.evaluate(() => window.__parity);
    if (state.error) throw new Error(state.error);
    result.backend = state.backend;
    result.warnings = state.warnings;
    const shot = await page.locator('canvas').screenshot({ type: 'png' });
    const got = downsample(readPng(shot), SS);
    const { mae, max, over, diff } = compare(ref, got);
    const outliers = over(limit.max);
    result.mae = Number(mae.toFixed(3));
    result.max = Number(max.toFixed(2));
    result.outliers = Number(outliers.toFixed(5));
    result.pass = mae <= limit.mae && outliers <= (limit.outliers ?? 0);
    mkdirSync(dir, { recursive: true });
    writePng(join(dir, 'browser.png'), got);
    writePng(join(dir, 'diff.png'), diff, (d) => Math.min(1, (d * 10) / 255)); // 10× amplified
  } catch (error) {
    result.pass = false;
    result.error = String(error.message ?? error);
    result.console = [...consoleLines];
  }
  if (!result.pass) failed++;
  results.push(result);
  const status = result.pass ? 'PASS' : 'FAIL';
  const outlierNote = limit.outliers ? `, ${(result.outliers * 100).toFixed(2)}% over (≤${limit.outliers * 100}%)` : '';
  const detail = result.error
    ? result.error.split('\n')[0]
    : `mae ${result.mae} (≤${limit.mae}) max ${result.max} (≤${limit.max}${outlierNote}) [${result.backend}]`;
  console.log(`${status}  ${name.padEnd(28)} ${detail}`);
}

await browser.close();
await server.close();

const rows = results.map(
  (r) => `| ${r.scene} | ${r.pass ? '✅' : '❌'} | ${r.mae ?? '—'} | ${r.max ?? '—'} | ${r.limit.mae} / ${r.limit.max} | ${r.backend ?? '—'} | ${r.error ? r.error.split('\n')[0] : (r.warnings ?? []).join('; ')} |`,
);
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'report.md'),
  ['# Parity report', '', '| Scene | Pass | MAE | Max | Limit (mae / max) | Backend | Notes |', '|---|---|---|---|---|---|---|', ...rows, ''].join('\n'),
);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} passed. Report: parity/compare/out/report.md`);
process.exit(failed ? 1 : 0);
