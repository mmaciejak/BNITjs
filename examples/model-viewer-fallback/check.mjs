/**
 * Automated check for the model-viewer fallback example (SPEC §9 Phase 9): one asset renders live
 * in three.js with BNITjs, without warnings or shader errors, and its baked standard materials
 * render in model-viewer (or, offline, in three.js's plain GLTFLoader) with their baked textures.
 * Saves both panes to parity/compare/out/fallback-<pane>-<backend>.png for inspection.
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
  for (const pane of ["baked", "live"]) {
    const shot = await page.locator(`#${pane}`).screenshot();
    writeFileSync(join(OUT, `fallback-${pane}-${backend}.png`), shot);
    assertDrawn(shot, pane);
  }
  if (problems.length) throw new Error(problems.join("\n"));
  console.log(`PASS model-viewer fallback [${backend}, baked in ${state.baked}]`);
} catch (error) {
  failed = true;
  console.log(`FAIL model-viewer fallback [${backend}]: ${error.message}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
