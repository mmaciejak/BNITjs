/**
 * Automated check for the configurator (SPEC §9 Phase 3 "done"): the page loads the Blender
 * asset without warnings or errors, and changing a control changes the rendered material.
 *
 *   cd runtime && npm run example:check
 */
import { exampleServer, load } from "../server.mjs";

const chromium = await load("playwright", "chromium");
const PNG = await load("pngjs", "PNG");
const webgl = process.argv.includes("--webgl");

const server = await exampleServer("configurator", 0);
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
});
const page = await browser.newPage({
  viewport: { width: 900, height: 600 },
  deviceScaleFactor: 1,
});
const problems = [];
// three r187: MeshPhysicalNodeMaterial.clone() warns about its own deprecated
// iridescenceThicknessRange getter (GLTFLoader clones materials). Not caused by this library.
const KNOWN = [/iridescenceThicknessRange/];
page.on("console", (m) => {
  if (
    (m.type() === "error" || m.type() === "warning") &&
    !KNOWN.some((re) => re.test(m.text()))
  ) {
    problems.push(`[${m.type()}] ${m.text()}`);
  }
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

const shot = async () => {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  return PNG.sync.read(await page.locator("#view canvas").screenshot());
};
const meanDiff = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4)
    for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
  return sum / ((a.data.length / 4) * 3);
};

let failed = false;
try {
  const url = `${server.resolvedUrls.local[0]}${webgl ? "?webgl" : ""}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__configurator?.ready, null, {
    timeout: 60_000,
  });
  const state = await page.evaluate(() => ({
    error: window.__configurator.error,
    names: window.__configurator.params?.names(),
  }));
  if (state.error) throw new Error(state.error);
  console.log("parameters:", state.names.join(", "));
  if (state.names.length !== 4)
    throw new Error(`expected 4 parameters, got ${state.names.length}`);

  const before = await shot();
  const changes = [
    ["Tiles/Scale", "3"],
    ["Tiles/Color A", "#30c060"],
  ];
  for (const [name, value] of changes) {
    await page.evaluate(
      ([n, v]) => {
        const input = document.querySelector(`input[data-param="${n}"]`);
        input.value = v;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      },
      [name, value],
    );
  }
  const after = await shot();
  const diff = meanDiff(before, after);
  const got = await page.evaluate(() => [
    window.__configurator.params.get("Tiles/Scale"),
    window.__configurator.params.get("Tiles/Color A"),
  ]);
  console.log(
    `after the change: Scale = ${got[0]}, Color A = [${got[1].map((v) => v.toFixed(3))}]; mean pixel change ${diff.toFixed(2)} levels`,
  );
  if (got[0] !== 3)
    throw new Error("the Scale control did not update the parameter");
  if (diff < 2)
    throw new Error("changing the controls did not change the render");
  if (problems.length)
    throw new Error(`console problems:\n${problems.join("\n")}`);
  console.log("PASS configurator");
} catch (error) {
  failed = true;
  console.error("FAIL configurator:", error.message);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
