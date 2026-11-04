# Project notes for Claude

The plan is in [SPEC.md](SPEC.md). Read it before starting a phase.

## Git workflow (SPEC §4)

- Make one commit per feature: one node, one exporter capability, or one harness feature. Never batch several nodes into one commit.
- Commit only when the tests for that feature pass: unit tests, plus a parity test for texture and color nodes. Run `tools/check.sh` (every suite: Python lint, exporter tests on both Blender versions, runtime, parity on WebGPU and WebGL2) before each commit, not just the suite you touched.
- A commit that adds or changes node support updates the README node table in the same commit. Edit `schema/node-support.json`, then run `python3 tools/sync_node_support.py`. The script regenerates the README table and `exporter/node_support.py`, and CI fails if they are out of sync.
- Commit messages use the `type(scope): message` style, e.g. `feat(nodes): add Voronoi F1 with euclidean distance`.
- When a phase ends, add a `CHANGELOG.md` entry and tag it `phase-N`.

## License (decided 2026-11-04)

- The whole repository is AGPL-3.0-or-later.
- Porting Blender's shader implementations (GLSL and C++, GPL-2.0-or-later) is allowed and is the preferred way to match Blender exactly.
- Each ported node file starts with a comment that names the Blender source file and version it was ported from, and keeps Blender's copyright line.
- Before adding a dependency, check that its license is AGPL-compatible.

## Commands

- Everything: `tools/check.sh` (`SKIP_PARITY=1` to skip the browser comparison)
- Parity: `blender -b --factory-startup --python parity/render_refs.py [-- scene ...]`, then `cd runtime && npm run parity [-- scene ...] [--webgl]`. New parity scene = `parity/scenes/<name>.py` with `build()` (and optional `setup(plane)`, `CAMERA = "PERSP"`)

- Runtime: `cd runtime && npm run lint && npm run typecheck && npm test && npm run build`
- Exporter lint: `ruff check . && ruff format --check .`
- Exporter tests: `"/Applications/Blender 5.app/Contents/MacOS/Blender" -b --factory-startup --python exporter/tests/run_tests.py` (5.2.2 LTS). Also run them with `"/Applications/Blender 2.app/..."`, which is 4.2.3 LTS, the minimum version.
- Set `BLENDER_USER_RESOURCES` to a temporary directory for headless runs, so the user's real preferences are never touched.

## Facts

- Glossy BSDF's RNA type is `ShaderNodeBsdfAnisotropic`.
- Point Density was removed in Blender 5.x.
- The Sky Texture models differ between Blender 4.2 and 5.x.
- Hook into the bundled glTF exporter (`io_scene_gltf2`, `glTF2ExportUserExtension`) instead of writing a separate glTF writer.
