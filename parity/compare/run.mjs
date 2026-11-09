/**
 * Parity harness, browser side (SPEC §6).
 *
 *   cd runtime && npm run parity -- [scene ...] [--webgl] [--headed] [--bake[=2048]]
 *
 * For every scene that has a reference in parity/references/ (made by parity/render_refs.py),
 * renders parity/compare/out/<scene>/scene.gltf in headless Chromium at SS× resolution,
 * box-downsamples in linear space (like Cycles' box pixel filter), and compares with the
 * Blender reference. Writes browser.png / diff.png per scene and report.{md,json}; exits 1 if a
 * scene exceeds its thresholds (parity/thresholds.json): the mean error must be ≤ mae, and at
 * most a fraction `outliers` (default 0) of pixels may have a channel error above max. A scene that
 * fails is run once more (printed as RETRY) before it counts as failed.
 *
 * --bake renders each material through the runtime's in-browser bake (bakeMaterial) at the given
 * texture size; the limits of thresholds.json's "bake" section apply on top of the scene's.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, startHarness } from './browser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PARITY = dirname(HERE);
const OUT = join(HERE, 'out');
const REFS = join(PARITY, 'references');
const SS = 4;

const PNG = await load('pngjs', 'PNG');

const args = process.argv.slice(2);
const useWebGL = args.includes('--webgl');
const headed = args.includes('--headed');
const bakeArg = args.find((a) => a === '--bake' || a.startsWith('--bake='));
const bakeSize = bakeArg ? Number(bakeArg.split('=')[1] ?? 2048) : 0;
const wanted = args.filter((a) => !a.startsWith('--'));

const thresholds = JSON.parse(readFileSync(join(PARITY, 'thresholds.json'), 'utf8'));
/** The limits of one scene (with the "bake" section's when baking). */
function limitFor(name) {
  const limit = { ...thresholds.default, ...(thresholds.scenes[name] ?? {}) };
  if (!bakeSize) return limit;
  return { ...limit, ...thresholds.bake.default, ...(thresholds.bake.scenes[name] ?? {}) };
}
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
const { base, page, consoleLines, close } = await startHarness({ width: 512 * SS, height: 512 * SS, headed });

const results = [];
let failed = 0;
/** Render and compare one scene. */
async function runScene(name) {
  const dir = join(OUT, name);
  const limit = limitFor(name);
  const result = { scene: name, limit };
  try {
    if (!existsSync(join(dir, 'scene.gltf'))) throw new Error('missing out/<scene>/scene.gltf; rerun render_refs.py');
    const ref = readPng(readFileSync(join(REFS, `${name}.png`)));
    // A stalled browser (e.g. an idle Mac throttling it) shows up as a timeout: retry once.
    let state;
    let shot;
    for (let attempt = 1; ; attempt++) {
      try {
        consoleLines.length = 0;
        await page.goto(`${base}index.html?scene=${encodeURIComponent(name)}&size=${ref.width}&ss=${SS}${useWebGL ? '&webgl' : ''}${bakeSize ? `&bake=${bakeSize}` : ''}`);
        await page.waitForFunction(() => window.__parity?.done, null, { timeout: 60_000 });
        state = await page.evaluate(() => window.__parity);
        if (state.error) throw new Error(state.error);
        shot = await page.locator('canvas').screenshot({ type: 'png', timeout: 30_000 });
        break;
      } catch (error) {
        if (attempt >= 2 || !/Timeout/i.test(String(error.message))) throw error;
        result.retried = true;
        console.log(`RETRY ${name}: ${String(error.message).split('\n')[0]}`);
      }
    }
    result.backend = state.backend;
    // Shader compile errors only show up in the console: report them with the warnings.
    const consoleErrors = consoleLines.filter((l) => l.startsWith('[error]') && !l.includes('favicon'));
    result.warnings = [...state.warnings, ...consoleErrors];
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
  return result;
}

for (const name of scenes) {
  const limit = limitFor(name);
  let result = await runScene(name);
  // A bad capture (rare, e.g. a frame not fully drawn) fails a scene that passes on a rerun: retry
  // a failed comparison once and keep the first attempt in the report.
  if (!result.pass && !String(result.error ?? '').startsWith('missing')) {
    console.log(`RETRY ${name}: first attempt mae ${result.mae ?? '—'} max ${result.max ?? '—'}${result.error ? ` (${result.error.split('\n')[0]})` : ''}`);
    const first = { mae: result.mae, max: result.max, error: result.error };
    result = await runScene(name);
    result.retried = true;
    result.firstAttempt = first;
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

await close();

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
