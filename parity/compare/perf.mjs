/**
 * Performance check (SPEC §6): frame time of heavy nodes at several Detail values.
 *
 *   blender -b --factory-startup --python parity/perf_cases.py
 *   cd runtime && npm run perf -- [case ...] [--webgl] [--size 2048] [--frames 40]
 *
 * Renders each out/perf_<case>/scene.gltf full-frame (size × size pixels) in headless Chromium and
 * times `frames` frames per Detail value, after warm-up. The shading cost is the frame time minus
 * the "baseline" case (a constant color), reported per megapixel. Writes out/perf.{md,json}.
 * Wall-clock timing on this machine's GPU: use the numbers to compare settings, not as absolutes.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHarness } from './browser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const DETAILS = [0, 2, 4, 8, 15];

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const useWebGL = args.includes('--webgl');
const size = option('--size', 2048);
const frames = option('--frames', 40);
const wanted = args.filter((a, i) => !a.startsWith('--') && !['--size', '--frames'].includes(args[i - 1]));

const cases = readdirSync(OUT)
  .filter((d) => d.startsWith('perf_') && existsSync(join(OUT, d, 'scene.gltf')))
  .map((d) => d.slice(5))
  .filter((c) => c === 'baseline' || wanted.length === 0 || wanted.includes(c))
  .sort((a, b) => (a === 'baseline' ? -1 : b === 'baseline' ? 1 : a.localeCompare(b)));
if (!cases.includes('baseline')) {
  console.error('No perf cases. Run: blender -b --factory-startup --python parity/perf_cases.py');
  process.exit(1);
}

const { base, page, consoleLines, close } = await startHarness({ width: size, height: size });
const results = {};
let backend = '';
let failed = false;
for (const name of cases) {
  consoleLines.length = 0;
  const query = `case=${name}&size=${size}&frames=${frames}&details=${DETAILS.join(',')}${useWebGL ? '&webgl' : ''}`;
  await page.goto(`${base}perf.html?${query}`);
  await page.waitForFunction(() => window.__perf?.done, null, { timeout: 600_000 });
  const state = await page.evaluate(() => window.__perf);
  const errors = consoleLines.filter((l) => l.startsWith('[error]') && !l.includes('favicon'));
  if (state.error || errors.length) {
    console.log(`FAIL  ${name}: ${(state.error ?? errors.join('\n')).split('\n')[0]}`);
    failed = true;
    continue;
  }
  backend = state.backend;
  results[name] = state.frameMs;
}
await close();

const megapixels = (size * size) / 1e6;
const baseline = results.baseline?.['-'] ?? 0;
const shading = (ms) => Math.max(0, ms - baseline) / megapixels;
const header = `| Case | ${DETAILS.map((d) => `Detail ${d}`).join(' | ')} |`;
const rows = Object.entries(results)
  .filter(([name]) => name !== 'baseline')
  .map(([name, byDetail]) => `| ${name} | ${DETAILS.map((d) => shading(byDetail[d]).toFixed(2)).join(' | ')} |`);
const report = [
  `# Performance check (${backend}, ${size}×${size}, ${frames} frames)`,
  '',
  `Shading cost in ms per megapixel per frame (frame time minus the ${baseline.toFixed(2)} ms baseline).`,
  '',
  header,
  `|---|${DETAILS.map(() => '---').join('|')}|`,
  ...rows,
  '',
].join('\n');
console.log(report);
writeFileSync(join(OUT, 'perf.md'), report);
writeFileSync(join(OUT, 'perf.json'), JSON.stringify({ backend, size, frames, baseline, results }, null, 2));
process.exit(failed ? 1 : 0);
