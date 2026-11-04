/**
 * Dev server for the examples: Vite with three.js resolved from runtime/node_modules (one copy,
 * shared with the runtime sources the examples import).
 *
 *   cd runtime && npm run example -- configurator     # http://localhost:5173
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
const RUNTIME = join(REPO, "runtime");
const require = createRequire(join(RUNTIME, "package.json"));

export async function load(name, key) {
  const mod = await import(pathToFileURL(require.resolve(name)).href);
  return mod[key] ?? mod.default?.[key];
}

/** A Vite dev server rooted at examples/<name>. */
export async function exampleServer(name, port = 5173) {
  const createServer = await load("vite", "createServer");
  const three = join(RUNTIME, "node_modules", "three");
  const server = await createServer({
    configFile: false,
    root: join(HERE, name),
    logLevel: "warn",
    server: { port, fs: { allow: [REPO] } },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: {
      alias: [
        {
          find: /^three\/addons\/(.*)$/,
          replacement: `${three}/examples/jsm/$1`,
        },
        {
          find: /^three\/webgpu$/,
          replacement: `${three}/build/three.webgpu.js`,
        },
        { find: /^three\/tsl$/, replacement: `${three}/build/three.tsl.js` },
        { find: /^three$/, replacement: `${three}/build/three.module.js` },
      ],
    },
  });
  await server.listen();
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const name = process.argv[2] ?? "configurator";
  const server = await exampleServer(name);
  console.log(`examples/${name}: ${server.resolvedUrls.local[0]}`);
}
