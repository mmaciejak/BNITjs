# Blender Shader Nodes on the Web — Project Spec

> Working name: **`blender-shader-web`** (rename freely).
> Goal: take a Blender material built from shader nodes, export it with a custom Blender add-on, and evaluate the procedural material **live in the browser** with three.js — no baked textures required for supported nodes.

---

## 1. Goals and non-goals

### Goals
- A **Blender add-on (Python)** that exports a material's node tree as a portable JSON graph alongside a glTF model.
- A **JavaScript/TypeScript runtime library** that rebuilds that graph with three.js **TSL** (Three Shading Language) and runs it on `MeshPhysicalNodeMaterial` / `MeshBasicNodeMaterial`.
- **Visual parity with Blender** for supported texture and color nodes, verified by automated image comparison.
- **Live parameters**: any exported node input can be exposed and changed at runtime (product configurators: "wood grain scale", "fabric color").
- **Graceful fallback**: unsupported nodes are baked to textures (in Blender at export, or in the browser on load) instead of breaking the material.
- **model-viewer support via baked fallback** (see Phase 9).

### Non-goals
- Matching Cycles/Eevee **lighting** exactly. Lighting is three.js's job; parity is measured on the *pattern/color* output, not the final lit image.
- Volumes, OSL scripts, and other offline-only features (see "Not planned" in §8).
- A full fork of model-viewer.

---

## 2. Architecture

```
Blender                         Web
─────────────────────────       ─────────────────────────────────────────
Material node tree              GLTFLoader + plugin
   │                               │
   ▼                               ▼
Exporter add-on ──► glTF + graph JSON ──► Graph parser ──► Node registry (Blender node → TSL fn)
   │   • flatten groups                                       │
   │   • drop reroutes/muted                                  ▼
   │   • sample ramps/curves                         TSL graph wired into
   │   • object bounds, seeds                        MeshPhysicalNodeMaterial
   │   • bake unsupported branches                            │
   ▼                                                          ▼
                                              three.js compiles → WGSL (WebGPU) / GLSL (WebGL2)
```

### Key decisions
- **Renderer:** `WebGPURenderer` (from `three/webgpu`), which falls back to WebGL2 automatically. TSL does not run on the classic `WebGLRenderer`.
- **Pin the three.js version** in `package.json`; TSL APIs still move between releases.
- **Blender versions:** minimum **4.2 LTS**, primary target the latest LTS. The exporter must handle node API differences (e.g. Musgrave merged into Noise in 4.1, new Mix node since 3.4, Gabor since 4.3).
- **Graph transport:** store the graph in the glTF material's `extensions` under a vendor extension (e.g. `EXT_blender_shader_graph`), with a standard glTF PBR material as the fallback in the same file. Viewers that don't know the extension still show something sensible.
- **Ramps and curves** are sampled **in Blender** by the exporter (e.g. `ColorRamp.evaluate()`, curve mapping evaluation) into fixed-size arrays → uploaded as 1D lookup textures. Exact by construction.
- **Coordinate systems:** exporter handles Z-up → Y-up. Runtime must reproduce Blender's Object and Generated coordinates in Blender's space (exporter writes the object's bounding box and transform).

---

## 3. Repository layout

```
blender-shader-web/
├── README.md                 # includes the node support table (§7)
├── SPEC.md                   # this file
├── LICENSE
├── exporter/                 # Blender add-on (Python)
│   ├── __init__.py
│   ├── graph_export.py
│   ├── bake_fallback.py
│   └── tests/
├── runtime/                  # npm package (TypeScript)
│   ├── src/
│   │   ├── loader/           # GLTFLoader plugin
│   │   ├── graph/            # parser, validation, flattening helpers
│   │   ├── nodes/            # one file per Blender node → TSL
│   │   ├── shaders/          # Principled → physical material mapping
│   │   ├── bake/             # in-browser bake-to-texture
│   │   └── params/           # live parameter API
│   └── tests/
├── schema/
│   └── graph.schema.json     # versioned JSON schema of the export format
├── parity/                   # visual parity harness
│   ├── scenes/               # .blend test files, one per node/feature
│   ├── references/           # Blender-rendered PNGs (generated)
│   └── compare/              # browser render + pixel diff
└── examples/
    ├── basic/
    ├── configurator/
    └── model-viewer-fallback/
```

---

## 4. Git workflow (starts in Phase 0)

- **Create the git repository in Phase 0, before writing any feature code.**
- **Commit after every feature.** One node, one exporter capability, one harness feature = one commit. Never batch several nodes into one commit.
- **Every commit that adds or changes node support also updates the README node table (§7) in the same commit.** The table must never be out of sync with the code.
- **Tag the end of each phase:** `phase-0`, `phase-1`, … and add a short entry to `CHANGELOG.md`.
- **Commit message style:** `type(scope): message`, for example:
  - `feat(nodes): add Voronoi F1 with euclidean distance`
  - `feat(exporter): sample Color Ramp into 256-entry LUT`
  - `test(parity): add Noise Texture reference scenes`
  - `docs(readme): mark Wave Texture as supported`
- A feature is only committed when its tests pass (unit tests, plus parity test for texture/color nodes).

---

## 5. Licensing rule (decide in Phase 0)

Blender's own shader implementations (the GLSL node files and C/C++ texture code) are **GPL**.

- **If the library will be MIT/commercial:** do **not** copy or port Blender source code. Implement nodes **clean-room** from the Blender manual, published algorithms, and observed outputs (parity renders). Document the source of each algorithm in a comment at the top of each node file.
- **If the library will be GPL:** porting Blender's implementations is allowed and is the fastest path to exact parity.
- Record the decision in `README.md` and `LICENSE` in Phase 0.

*(This is a practical note, not legal advice — check before publishing.)*

---

## 6. Testing strategy

### Visual parity harness (core of the project)
Lighting differs between Blender and three.js, so parity is tested on **unlit pattern output only**:

1. Each test scene in `parity/scenes/` is a flat plane viewed by an **orthographic camera**, material = node under test → **Emission** shader (strength 1).
2. Blender renders it with view transform **Standard** (not AgX/Filmic), no bloom, fixed resolution (e.g. 512×512) → `parity/references/<name>.png`. Rendering is scripted (`blender -b … --python render_refs.py`).
3. The browser renders the same graph through `MeshBasicNodeMaterial.colorNode` with an identical camera, via headless Chromium (Playwright).
4. A pixel diff compares the two. Metrics: mean absolute error and max error per channel. Thresholds per node live in a config file; tighten them over time.
5. Diff images are saved on failure for inspection.

### Other tests
- **Exporter unit tests** (run in background Blender): graph structure, group flattening, ramp sampling, version differences.
- **Runtime unit tests:** graph parsing, schema validation, node registry coverage.
- **Performance check:** frame time on a reference mid-range mobile GPU budget for heavy nodes (Noise with high detail, Voronoi fractal, Gabor).

---

## 7. README requirement: node support table

The README **must** contain a table of **every** Blender shader node with its current status. It is updated in the same commit as any change to node support.

Statuses:
- ✅ **Supported** — implemented and passing parity tests
- 🟡 **Partial** — implemented with documented limitations (list them in Notes)
- 🚧 **Not yet** — planned, not implemented
- 🧊 **Baked** — not computed live; exporter bakes it to a texture
- ❌ **Not planned** — out of scope

Format:

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Math | Converter | 🚧 Not yet | 3 | |
| Noise Texture | Texture | 🚧 Not yet | 4 | |
| Ambient Occlusion | Input | 🧊 Baked | 9 | Bake in exporter |
| Script | Converter | ❌ Not planned | — | OSL not possible in realtime |

The initial README table is created in Phase 0 from §8 with every planned node set to 🚧 and the out-of-scope nodes set to ❌ / 🧊.

---

## 8. Node inventory and difficulty tiers

### 🟢 Easy — direct 1:1 translation
| Node | Category | Phase | Notes |
|---|---|---|---|
| Math (all ops) | Converter | 3 | |
| Vector Math (all ops) | Converter | 3 | |
| Clamp | Converter | 3 | |
| Map Range (all modes, float + vector) | Converter | 3 | |
| Vector Rotate | Vector | 3 | |
| Separate / Combine XYZ | Converter | 3 | |
| Separate / Combine Color (RGB, HSV, HSL) | Converter | 3 | |
| Mix (Float, Vector, Color + all blend modes) | Color | 3 | |
| Invert Color | Color | 3 | |
| Brightness/Contrast | Color | 3 | |
| Gamma | Color | 3 | |
| Hue/Saturation/Value | Color | 3 | |
| RGB to BW | Converter | 3 | |
| Value | Input | 2 | |
| RGB | Input | 2 | |
| Object Info (location, color, random, alpha) | Input | 3 | Exporter writes per-object seed |
| Texture Coordinate (UV, Object, Normal, Reflection, Generated) | Input | 2 | Generated needs exported bounds |
| UV Map | Input | 3 | |
| Mapping (Point, Texture, Vector, Normal) | Vector | 2 | |
| Color Ramp | Converter | 3 | Sampled in Blender → 1D LUT |
| RGB Curves / Float Curve / Vector Curves | Color / Converter / Vector | 3 | Sampled in Blender → 1D LUT |
| Image Texture | Texture | 3 | Box projection = 🟡 at first |
| Checker Texture | Texture | 3 | |
| Gradient Texture | Texture | 3 | |
| Fresnel | Input | 3 | |
| Layer Weight | Input | 3 | |
| Attribute / Color Attribute | Input | 3 | Via glTF vertex attributes |
| Principled BSDF (base color, metallic, roughness, normal, alpha, emission) | Shader | 2 | Maps to `MeshPhysicalNodeMaterial` |
| Emission | Shader | 2 | |
| Diffuse BSDF / Glossy BSDF | Shader | 3 | Mapped to physical material params |
| Material Output | Output | 2 | |
| Reroute, Frame, Group Input/Output | Layout | 1 | Removed/flattened by exporter |

### 🟡 Medium — doable, real effort for parity
| Node | Category | Phase | Notes |
|---|---|---|---|
| White Noise Texture | Texture | 4 | Hash must match exactly |
| Noise Texture (fBm, multifractal, ridged, hybrid, hetero terrain; detail, roughness, lacunarity, distortion, normalize; 1D–4D) | Texture | 4 | Highest-value node; biggest parity effort |
| Voronoi Texture (F1, F2, Smooth F1, Distance to Edge, N-Sphere Radius; all metrics; 1D–4D; fractal detail) | Texture | 5 | Ship F1 first, then the rest |
| Wave Texture | Texture | 6 | |
| Magic Texture | Texture | 6 | |
| Brick Texture | Texture | 6 | |
| Gabor Texture | Texture | 6 | Expensive on mobile; recommend bake |
| Sky Texture (Preetham, Hosek-Wilkie) | Texture | 6 | World only |
| Sky Texture (Nishita) | Texture | 6 | Needs precomputed LUT |
| Environment Texture | Texture | 6 | World/background |
| Bump | Vector | 7 | Screen-space derivatives |
| Normal Map (tangent / object / world) | Vector | 7 | Needs glTF tangents |
| Displacement / Vector Displacement | Vector | 7 | Vertex stage, needs dense mesh |
| Geometry (Position, Normal, True Normal, Incoming, Backfacing, Random per Island) | Input | 7 | Random per Island exported as attribute |
| Geometry → Pointiness | Input | 7 | 🧊 exporter bakes to vertex attribute |
| Wireframe | Input | 7 | Needs barycentric attribute |
| Tangent (UV, Radial) | Input | 7 | |
| Blackbody | Converter | 7 | Fitted formula |
| Wavelength | Converter | 7 | |
| Vector Transform | Vector | 7 | |
| Principled BSDF advanced (coat, sheen, transmission, IOR, thin film, anisotropy, specular tint) | Shader | 8 | Approximate; not identical to Cycles |
| Mix Shader / Add Shader | Shader | 8 | Principled+Principled → mix params; otherwise approximation |

### 🟠 Hard — approximation only
| Node | Category | Phase | Notes |
|---|---|---|---|
| Light Path | Input | 10 | Only rasterizer-meaningful outputs (e.g. Is Camera Ray = 1) |
| Shader to RGB | Converter | 10 | Needs custom lighting inside the material |
| Subsurface Scattering | Shader | 10 | Thickness/translucency fake |
| Translucent BSDF | Shader | 10 | Fake |
| Toon BSDF | Shader | 10 | Custom lighting |
| Sheen BSDF (standalone) | Shader | 10 | Map onto physical sheen |
| Hair BSDF / Principled Hair | Shader | 10 | Likely ❌ |
| Holdout | Shader | 10 | Alpha handling, scene-dependent |
| Glass / Refraction BSDF | Shader | 8 | Screen-space transmission |
| Transparent BSDF | Shader | 8 | Alpha blending |

### 🔴 Not feasible in realtime — bake or skip
| Node | Category | Status | Notes |
|---|---|---|---|
| Ambient Occlusion | Input | 🧊 Baked | Bake in exporter or rely on scene SSAO |
| Bevel | Input | 🧊 Baked | Bake to normal map |
| Point Density | Texture | 🧊 Baked | |
| Principled Volume / Volume Absorption / Volume Scatter / Volume Info | Shader / Input | ❌ Not planned | |
| Script (OSL) | Converter | ❌ Not planned | |
| Particle Info / Hair Info / Curves Info / Point Info | Input | ❌ Not planned | Out of scope for mesh materials |
| Light Falloff / IES Texture | Light | ❌ Not planned | Belong to lights |
| AOV Output / Light Output | Output | ❌ Not planned | |

---

## 9. Phases

Each phase ends with: all tests passing, README table updated, `CHANGELOG.md` entry, git tag `phase-N`.

### Phase 0 — Repository and foundations
- **Initialize the git repository** and make the first commit before anything else.
- Create the folder layout from §3, `.gitignore`, `CHANGELOG.md`.
- Decide and record the license (§5).
- Create `README.md` with project description and the **full node support table** (§7) generated from §8 — all planned nodes 🚧, out-of-scope nodes ❌/🧊.
- Set up tooling: TypeScript + Vite for `runtime/`, lint/format, Python lint for `exporter/`, CI running tests on push.
- **Done when:** repo exists with clean history, README table lists every node, CI is green on an empty test suite.

### Phase 1 — Export format and exporter MVP
- Write `schema/graph.schema.json` v1: nodes (id, type, Blender version, properties), inputs (default values, linked or not), links, material outputs, metadata (object bounds, transform, seed).
- Exporter add-on:
  - walks `material.node_tree`, flattens node groups, removes reroutes/frames/muted nodes (respecting mute pass-through);
  - samples Color Ramp and Curves into arrays;
  - writes the graph into the glTF via the vendor extension, plus a standard PBR fallback material;
  - reports unsupported nodes in the Blender UI.
- Exporter unit tests in background Blender.
- **Done when:** a test `.blend` exports a valid glTF whose graph validates against the schema.

### Phase 2 — Runtime core and parity harness
- GLTFLoader plugin that reads the extension and builds a node material.
- Node registry: maps Blender node type → TSL implementation; unknown nodes produce a warning and a fallback value (never a crash).
- First nodes: Value, RGB, Texture Coordinate, Mapping, Principled BSDF (base inputs), Emission, Material Output.
- Build the **parity harness** (§6): scripted Blender reference renders, Playwright browser renders, pixel diff, report.
- **Done when:** a simple material (UV → Mapping → color into Principled) loads in three.js and passes its parity test.

### Phase 3 — Easy tier and live parameters
- Implement all remaining 🟢 nodes from §8, **one commit per node**, each with a parity scene where applicable.
- Live parameter API: exporter marks exposed inputs (e.g. via a custom property or a naming convention); runtime exposes them as uniforms, e.g. `material.params.set('Grain Scale', 4.0)`.
- **Done when:** all 🟢 nodes are ✅ in the README and the configurator example changes parameters live.

### Phase 4 — Noise
- White Noise Texture, then Noise Texture: 1D–4D, all fractal types, detail, roughness, lacunarity, distortion, normalize.
- Dense parity coverage: parameter sweeps, not just defaults.
- Performance check at high detail values; document recommended limits.
- **Done when:** Noise passes parity across the parameter sweep.

### Phase 5 — Voronoi
- F1 euclidean first (commit), then other metrics, F2, Smooth F1, Distance to Edge, N-Sphere Radius, dimensions, fractal detail — each as its own commit.
- **Done when:** all Voronoi modes are ✅ or documented as 🟡.

### Phase 6 — Remaining textures
- Wave, Magic, Brick, Gabor, Sky (Preetham, Hosek, Nishita), Environment Texture, Image Texture box projection.
- **Done when:** all listed textures pass parity or are documented 🟡.

### Phase 7 — Surface detail and geometry
- Bump, Normal Map, Displacement / Vector Displacement, Geometry outputs, Pointiness (exporter bake to vertex attribute), Wireframe (barycentrics), Tangent, Blackbody, Wavelength, Vector Transform.
- **Done when:** a bump/normal-heavy test material looks correct in three.js and all nodes have README status.

### Phase 8 — Shader combination and advanced Principled
- Principled advanced inputs → physical material (coat, sheen, transmission, IOR, thin film, anisotropy).
- Mix Shader / Add Shader: parameter mixing for Principled+Principled; documented approximation otherwise.
- Glass, Refraction, Transparent BSDF.
- **Done when:** common product materials (car paint with coat, glass, fabric with sheen) render plausibly; limitations listed in README.

### Phase 9 — Baking and model-viewer fallback
- **Exporter bake:** any branch containing a 🧊 or unsupported node is baked in Blender to a texture and replaced by an Image Texture node in the exported graph.
- **In-browser bake:** runtime option to render the procedural result into a texture once on load (or on parameter change) for performance on weak devices.
- **model-viewer mode:** exporter option producing a plain glTF with all procedurals baked, so it works in model-viewer without custom shaders. Example in `examples/model-viewer-fallback/`.
- **Done when:** AO/Bevel materials export correctly, and the same asset works in both three.js (live) and model-viewer (baked).

### Phase 10 — Hard-tier approximations
- Light Path (meaningful outputs only), Shader to RGB, SSS fake, Translucent, Toon, Sheen BSDF, Holdout.
- Each node either reaches 🟡 with documented behaviour or is moved to ❌ with a reason in the README.

### Phase 11 — Release
- Docs site, API reference, examples (basic, configurator, model-viewer fallback).
- Publish the npm package and the Blender add-on (zip / extensions platform).
- Final README pass: node table complete and accurate, known limitations, version compatibility matrix (Blender × three.js).

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Procedural textures don't match Blender closely enough | Parity harness from Phase 2; parameter sweeps; per-node thresholds |
| GPL contamination | License decision in Phase 0; clean-room rule if non-GPL |
| TSL API changes | Pin three.js version; upgrade deliberately with full parity run |
| Blender node API changes between versions | Version field in export schema; exporter tests on each supported Blender version |
| Heavy shaders too slow on mobile | In-browser bake option (Phase 9); documented detail limits |
| model-viewer can't run custom shaders | Baked fallback mode only; no fork |
