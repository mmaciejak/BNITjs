/**
 * Automated check for the model-viewer fallback example (SPEC §9 Phase 9): one asset renders live
 * in three.js with BNITjs, without warnings or shader errors, and its baked standard materials
 * render in model-viewer (or, offline, in three.js's plain GLTFLoader) with their baked textures.
 * The live pane is then baked in the browser (bakeMaterial): it must look like the live render,
 * and change when a live parameter changes (updateOnParamChange).
 * Saves the panes to parity/compare/out/fallback-<pane>-<backend>.png for inspection.
 *
 *   cd runtime && npm run example:fallback [-- --webgl]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exampleServer, load } from "../server.mjs";

const OUT = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), "parity", "compare", "out");
const chromium = await load("playwright", "chromium");
const PNG = await load("pngjs", "PNG");
const webgl = process.argv.includes("--webgl");
const backend = webgl ? "webgl2" : "webgpu";

const server = await exampleServer("model-viewer-fallback", 0);
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 1 });
const problems = [];
// three r187: MeshPhysicalNodeMaterial.clone() warns about its own deprecated
// iridescenceThicknessRange getter (GLTFLoader clones materials). Not caused by this library.
// model-viewer bundles its own three.js, next to the page's: two instances are expected.
const KNOWN = [/iridescenceThicknessRange/, /Multiple instances of Three\.js/];
page.on("console", (m) => {
  if ((m.type() === "error" || m.type() === "warning") && !KNOWN.some((re) => re.test(m.text()))) {
    problems.push(`[${m.type()}] ${m.text()}`);
  }
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

/** Throw unless the screenshot shows something: not a single flat color. */
function assertDrawn(shot, pane) {
  const img = PNG.sync.read(shot);
  let min = 255;
  let max = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  if (max - min < 40) throw new Error(`the ${pane} pane is nearly flat (${min}–${max})`);
}

/** Mean absolute difference of two same-size screenshots, in 8-bit levels. */
function meanDiff(a, b) {
  const x = PNG.sync.read(a).data;
  const y = PNG.sync.read(b).data;
  let sum = 0;
  for (let i = 0; i < x.length; i += 4) {
    for (let c = 0; c < 3; c++) sum += Math.abs(x[i + c] - y[i + c]);
  }
  return sum / ((x.length / 4) * 3);
}

const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// Limits for the in-browser bake, in mean 8-bit levels over the live pane.
const BAKE_MATCH = 2;
const PARAM_CHANGE = 2;

let failed = false;
try {
  await page.goto(`${server.resolvedUrls.local[0]}${webgl ? "?webgl" : ""}`);
  await page.waitForFunction(() => window.__fallback?.ready, null, { timeout: 120_000 });
  const state = await page.evaluate(() => window.__fallback);
  if (state.error) throw new Error(state.error);
  problems.push(...state.warnings.map((w) => `[runtime] ${w}`));
  for (const name of ["Worn Paint", "Floor"]) {
    if (!state.bakedTextures[name]) throw new Error(`baked material "${name}" has no base color texture`);
  }
  // model-viewer renders on demand; give both views a few frames.
  await page.waitForTimeout(1000);
  mkdirSync(OUT, { recursive: true });
  const shots = {};
  for (const pane of ["baked", "live"]) {
    shots[pane] = await page.locator(`#${pane}`).screenshot();
    writeFileSync(join(OUT, `fallback-${pane}-${backend}.png`), shots[pane]);
    assertDrawn(shots[pane], pane);
  }
  await page.evaluate(() => window.__fallback.setInBrowserBake(true));
  await frames();
  const inBrowser = await page.locator("#live").screenshot();
  writeFileSync(join(OUT, `fallback-inbrowser-${backend}.png`), inBrowser);
  const bakeDiff = meanDiff(shots.live, inBrowser);
  if (bakeDiff > BAKE_MATCH) throw new Error(`in-browser bake differs from live by ${bakeDiff.toFixed(2)} levels`);
  await page.evaluate(() => window.__fallback.setParam("Paint", [0.6, 0.1, 0.02]));
  await frames();
  const changed = await page.locator("#live").screenshot();
  const paramDiff = meanDiff(inBrowser, changed);
  if (paramDiff < PARAM_CHANGE) throw new Error(`the bake did not follow a parameter change (${paramDiff.toFixed(2)})`);
  if (problems.length) throw new Error(problems.join("\n"));
  console.log(
    `PASS model-viewer fallback [${backend}, baked in ${state.baked}; in-browser bake ${bakeDiff.toFixed(2)} levels from live]`,
  );
} catch (error) {
  failed = true;
  console.log(`FAIL model-viewer fallback [${backend}]: ${error.message}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
