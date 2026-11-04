# Changelog

Each phase from [SPEC.md](SPEC.md) gets an entry when it is tagged (`phase-N`).

## phase-1: Export format and exporter MVP

- `schema/graph.schema.json` v1: nodes, sockets, links, sampled ramps and curves, per-object data. Fixtures in `schema/fixtures/` are validated with Ajv.
- Exporter hooks into Blender's bundled glTF exporter. Each material gets an `EXT_blender_shader_graph` extension (not required, so the standard PBR material stays as fallback). Each mesh node gets per-object data (pass index, color, texture space).
- Graph walker: starts at the active Material Output, flattens nested node groups, removes reroutes, frames and muted nodes (mute pass-through), drops muted and invalid links, and prunes unused nodes. Unlinked group inputs become `BSW_Value` constants.
- Color Ramp and Float, RGB and Vector Curves are sampled in Blender into 256-entry lookup tables. Raw stops and points, curve ranges and extrapolation slopes are exported too.
- Unsupported nodes are reported in a Material Properties panel ("Shader Web (three.js)") and as glTF export warnings.
- Node status lives in `schema/node-support.json`; the README table and the exporter's support list are generated from it.
- Tested on Blender 4.2.3 LTS and 5.2.2 LTS (20 exporter tests).

## phase-0: Repository and foundations

- Repository layout, `.gitignore`.
- Runtime tooling: TypeScript, Vite library build, Vitest, ESLint, Prettier; three.js pinned to 0.187.0.
- Exporter tooling: Blender extension manifest, ruff, background-Blender test runner (tested on 4.2.3 and 5.2.2).
- CI: runtime checks, ruff, exporter tests on Blender 4.2 and 5.2.
- README with the full node support table, built from the shader node list of Blender 4.2 and 5.2.
- License: AGPL-3.0-or-later for the whole repository, so porting Blender's shader code is allowed (SPEC §5).
