/**
 * Automated check for the product-materials example (SPEC §9 Phase 8): the page loads the asset
 * without warnings or shader errors on the chosen backend, and renders something. Saves the frame
 * to parity/compare/out/materials-<backend>.png for inspection.
 *
 *   cd runtime && npm run example:materials [-- --webgl]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exampleServer, load } from "../server.mjs";

const OUT = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), "parity", "compare", "out");
const chromium = await load("playwright", "chromium");
const PNG = await load("pngjs", "PNG");
const webgl = process.argv.includes("--webgl");

const server = await exampleServer("materials", 0);
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 500 }, deviceScaleFactor: 1 });
const problems = [];
// three r187: MeshPhysicalNodeMaterial.clone() warns about its own deprecated
// iridescenceThicknessRange getter (GLTFLoader clones materials). Not caused by this library.
const KNOWN = [/iridescenceThicknessRange/];
page.on("console", (m) => {
  if ((m.type() === "error" || m.type() === "warning") && !KNOWN.some((re) => re.test(m.text()))) {
    problems.push(`[${m.type()}] ${m.text()}`);
  }
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

let failed = false;
try {
  await page.goto(`${server.resolvedUrls.local[0]}${webgl ? "?webgl" : ""}`);
  await page.waitForFunction(() => window.__materials?.ready, null, { timeout: 120_000 });
  const state = await page.evaluate(() => window.__materials);
  if (state.error) throw new Error(state.error);
  problems.push(...state.warnings.map((w) => `[runtime] ${w}`));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = await page.locator("#view canvas").screenshot();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `materials-${webgl ? "webgl2" : "webgpu"}.png`), shot);
  // Something was drawn: the frame is not a single flat color.
  const img = PNG.sync.read(shot);
  let min = 255;
  let max = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  if (max - min < 40) throw new Error(`the frame is nearly flat (${min}–${max})`);
  if (problems.length) throw new Error(problems.join("\n"));
  console.log(`PASS materials [${webgl ? "webgl2" : "webgpu"}]`);
} catch (error) {
  failed = true;
  console.log(`FAIL materials [${webgl ? "webgl2" : "webgpu"}]: ${error.message}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
