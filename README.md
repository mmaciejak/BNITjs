# Blender Shader Web

Take a Blender material built from shader nodes, export it with a Blender add-on, and evaluate the procedural material **live in the browser** with three.js TSL. No baked textures are needed for supported nodes.

- **`exporter/`**: Blender add-on (4.2 LTS+). It writes the material node graph into the glTF file under a vendor extension (`EXT_blender_shader_graph`), with a standard PBR material as the fallback.
- **`runtime/`**: TypeScript npm package. A GLTFLoader plugin rebuilds the graph as TSL on `MeshPhysicalNodeMaterial` (rendered with `WebGPURenderer`, which falls back to WebGL2).
- **`parity/`**: a visual parity harness that compares Blender reference renders with browser renders, pixel by pixel.

See [SPEC.md](SPEC.md) for the full design and roadmap.

> **Status:** Phase 3 done. Every easy-tier node is live, and 244 parity scenes match Blender on WebGPU and WebGL2. Live parameters and a configurator example work. Phase 4 (Noise) is next.

## License

The whole repository (exporter, runtime, schema, parity harness and examples) is licensed under the **GNU Affero General Public License v3.0 or later** ([LICENSE](LICENSE)).

Because the project uses a GPL-family license, node implementations may be ported from Blender's own shader code (GPL-2.0-or-later), which AGPL-3.0 can include (SPEC §5). Every ported file names the Blender source file it comes from and keeps Blender's copyright notice.

The AGPL also covers network use. If you serve a modified version of the runtime to users over a network, you must offer those users the corresponding source code.

## Compatibility

| Component | Versions |
|---|---|
| Blender | 4.2 LTS (minimum), 5.2 LTS (primary target) |
| three.js | 0.187.0 (pinned) |

## Development

`tools/check.sh` runs every suite: Python lint, node-table sync, exporter tests on Blender 4.2 and 5.2, runtime lint, typecheck, tests and build, and the parity harness on WebGPU and WebGL2. Run it before every commit.

```sh
# Runtime
cd runtime && npm install
npm run lint && npm run typecheck && npm test && npm run build

# Exporter: lint, tests in background Blender, build the extension zip
ruff check . && ruff format --check .
blender -b --factory-startup --python exporter/tests/run_tests.py
blender --command extension build --source-dir exporter --output-dir dist

# Regenerate the exported fixtures in schema/fixtures/ (with Blender 5.2) after changing the format
blender -b --factory-startup --python exporter/tests/make_fixtures.py

# After editing schema/node-support.json
python3 tools/sync_node_support.py

# Parity: render Blender references + export glTF, then compare in headless Chromium
blender -b --factory-startup --python parity/render_refs.py [-- scene ...]
cd runtime && npm run parity [-- scene ...] [--webgl]   # report: parity/compare/out/report.md

# Performance check: frame time of Noise and Voronoi at several Detail values
blender -b --factory-startup --python parity/perf_cases.py
cd runtime && npm run perf [-- case ...] [--webgl]     # report: parity/compare/out/perf.md
```

### Using the runtime

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WebGPURenderer } from 'three/webgpu';
import { registerBlenderShaderGraph } from 'blender-shader-web';

const renderer = new WebGPURenderer(); // falls back to WebGL2
const loader = registerBlenderShaderGraph(new GLTFLoader());
const gltf = await loader.loadAsync('model.gltf'); // materials rebuilt from their node graphs
```

Nodes that aren't supported yet log a warning and use a default value; a material that fails to build falls back to the standard glTF material in the same file.

### World

The exporter also writes the scene's World (its active World Output) to the glTF file. To show it as the background:

```js
import { Scene } from 'three/webgpu';
import { applyBlenderWorld, getBlenderWorld } from 'blender-shader-web';

const scene = new Scene();
scene.add(gltf.scene);
applyBlenderWorld(scene, gltf);          // scene.backgroundNode = the World's Background
getBlenderWorld(gltf)?.params.set(...);  // live parameters work in the World too
```

Texture coordinates in a World are the view direction, as in Blender. The World does not light the scene yet: set `scene.environment` yourself.

### Live parameters

In Blender, label a Value or Color node `$Grain Scale`, or a group node `$Wood`. A labelled group exposes its unlinked inputs as `Wood/<input>`, with the group's min and max. In three.js:

```js
const params = getParams(mesh.material); // or mesh.material.params
params.names();                          // ['Grain Scale', 'Wood/Color', ...]
params.set('Grain Scale', 4);            // takes effect on the next frame
params.set('Wood/Color', [0.6, 0.3, 0.1]); // linear RGB, as in Blender
```

`examples/configurator` builds sliders and color pickers from these parameters. To run it: `cd runtime && npm run example -- configurator`.

### Performance of procedural textures

Procedural textures are evaluated for every pixel, every frame. Their cost grows with the number of octaves, which is ⌊Detail⌋ + 1, plus one more when Detail has a fractional part. `npm run perf` measures the shading cost in ms per megapixel per frame. Below is one run on an Apple M3 Pro (WebGPU; WebGL2 gives similar numbers). Absolute numbers varied up to 2× between sessions on the same machine (probably its thermal state), so compare rows rather than reading them as exact budgets.

| Texture | Detail 0 | Detail 2 | Detail 4 | Detail 8 | Detail 15 |
|---|---|---|---|---|---|
| Noise 2D, Fac | 0.00 | 0.07 | 1.02 | 1.24 | 2.78 |
| Noise 3D, Fac | 0.67 | 0.82 | 1.30 | 2.63 | 4.78 |
| Noise 3D, Color | 1.10 | 2.35 | 4.39 | 7.70 | 14.47 |
| Noise 3D, Color, Distortion | 2.18 | 3.70 | 5.31 | 8.56 | 15.98 |
| Noise 4D, Fac | 1.48 | 2.86 | 3.65 | 7.21 | 13.23 |
| Noise 4D, Color | 2.91 | 6.51 | 11.72 | 20.73 | 35.36 |
| Voronoi 2D F1 | 0.00 | 0.96 | 0.92 | 1.51 | 3.51 |
| Voronoi 3D F1 | 1.55 | 2.54 | 4.13 | 8.08 | 14.76 |
| Voronoi 3D F2 | 1.24 | 2.61 | 4.61 | 7.97 | 15.64 |
| Voronoi 3D Distance to Edge | 2.82 | 6.75 | 10.87 | 18.86 | 33.99 |
| Voronoi 3D Smooth F1 | 5.02 | 14.16 | 21.76 | 38.72 | 70.01 |
| Voronoi 4D F1 | 3.97 | 11.11 | 16.84 | 29.65 | 53.47 |
| Voronoi 4D Smooth F1 | 37.53 | 113.60 | 188.10 | 332.40 | 568.42 |

A full-screen 1080p view is about 2 megapixels. Rules of thumb:

- Noise **Color** costs about 3× Noise Fac, because it evaluates the noise three times. Voronoi's Color output is almost free: it comes from the same cell search.
- The cost per octave grows with the dimensions. 4D costs about 2.5× 3D for Noise and about 3.5× for Voronoi. 2D is the cheapest.
- Voronoi **Smooth F1** searches 5^dims cells instead of 3^dims: about 5× F1 in 3D and about 10× in 4D. Avoid 4D Smooth F1 in real time. **Distance to Edge** makes two passes, about 2.5× F1.
- Recommended limits on desktop GPUs: Noise Detail ≤ 8, and Voronoi 3D Detail ≤ 2 (Smooth F1: Detail 0).
- On phones: Noise 3D Fac Detail ≤ 2, Noise Color or 4D Detail 0, and Voronoi only in 2D or at 3D F1 Detail 0. These are estimates: they assume a mid-range phone GPU is 5–10× slower than the M3 Pro. They have not been measured on phones.
- Above these limits, bake the texture (planned for Phase 9).

### Using the exporter

1. Install the extension zip: Edit › Preferences › Get Extensions › ⌄ › Install from Disk…
2. Export with File › Export › glTF 2.0 as usual. Every material gets its node graph in the `EXT_blender_shader_graph` extension; the normal PBR material stays in the file as a fallback.
3. Material Properties › **Shader Web (three.js)** lists the nodes that the runtime can't evaluate live yet.

Workflow rules (SPEC §4): one commit per feature, using the `type(scope): message` style. Every commit that changes node support also updates the table below. Each phase ends with a `phase-N` tag and a `CHANGELOG.md` entry.

## Node support

<!-- node-table:start (generated by tools/sync_node_support.py from schema/node-support.json) -->

✅ Supported · 🟡 Partial · 🚧 Not yet · 🧊 Baked · ❌ Not planned

This table lists every shader node in Blender 4.2 LTS and 5.2 LTS. Nodes that exist in only one of those versions are marked in Notes.

### Input

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Ambient Occlusion | Input | 🧊 Baked | 9 | Bake in exporter or rely on scene SSAO |
| Attribute | Input | 🟡 Partial | 3 | Geometry type: color attributes, UV maps and "_" custom attributes (glTF Attributes option). Instancer/Object/View Layer types not supported |
| Bevel | Input | 🧊 Baked | 9 | Bake to normal map |
| Camera Data | Input | ✅ Supported | 3 | |
| Color | Input | ✅ Supported | 2 | Named "RGB" in 4.2 |
| Color Attribute | Input | 🟡 Partial | 3 | By name or render-active, via the exporter's COLOR_n layout; ambiguous when the standard material also uses a color attribute and the mesh has several |
| Curves Info | Input | ❌ Not planned | — | Out of scope for mesh materials |
| Fresnel | Input | ✅ Supported | 3 | Front faces |
| Geometry | Input | 🚧 Not yet | 7 | Random per Island is exported as an attribute. Pointiness 🧊 is baked to a vertex attribute |
| Layer Weight | Input | ✅ Supported | 3 | Front faces |
| Light Path | Input | 🚧 Not yet | 10 | Only rasterizer-meaningful outputs (e.g. Is Camera Ray = 1) |
| Object Info | Input | ✅ Supported | 3 | Random matches Cycles for non-instanced objects (name hash) |
| Particle Info | Input | ❌ Not planned | — | Out of scope for mesh materials |
| Point Info | Input | ❌ Not planned | — | Out of scope for mesh materials |
| Tangent | Input | 🚧 Not yet | 7 | UV and Radial |
| Texture Coordinate | Input | 🟡 Partial | 2 | All outputs pass parity (ortho and perspective). Not supported yet: the Object setting (another object's space) and From Instancer |
| UV Map | Input | ✅ Supported | 3 | Resolves names via the exported UV map list; From Instancer not supported |
| Value | Input | ✅ Supported | 2 | |
| Volume Info | Input | ❌ Not planned | — | Volumes |
| Wireframe | Input | 🚧 Not yet | 7 | Needs a barycentric attribute |

### Shader

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Add Shader | Shader | 🚧 Not yet | 8 | Approximation |
| Background | Shader | 🟡 Partial | 6 | Shown as the scene background with applyBlenderWorld(scene, gltf). The world does not light the scene yet (set scene.environment yourself) |
| Diffuse BSDF | Shader | 🟡 Partial | 3 | Physical material without specular (color parity-tested). Oren-Nayar roughness not mapped; Normal in phase 7 |
| Emission | Shader | ✅ Supported | 2 | |
| Glass BSDF | Shader | 🚧 Not yet | 8 | Screen-space transmission |
| Glossy BSDF | Shader | 🟡 Partial | 3 | Fully metallic physical material with the same roughness; no parity test (lighting differs). Anisotropy in phase 8 |
| Hair BSDF | Shader | 🚧 Not yet | 10 | Likely ❌ |
| Holdout | Shader | 🚧 Not yet | 10 | Alpha handling, scene-dependent |
| Metallic BSDF | Shader | 🚧 Not yet | 8 | Blender 4.3+. Maps onto metalness/specular color |
| Mix Shader | Shader | 🚧 Not yet | 8 | Principled+Principled → mix params; otherwise approximation |
| Principled BSDF | Shader | 🟡 Partial | 2 | Base color, metallic, roughness, alpha and emission (base color parity-tested). Normal in phase 7; coat, sheen, transmission, IOR, thin film, anisotropy in phase 8 |
| Principled Hair BSDF | Shader | 🚧 Not yet | 10 | Likely ❌ |
| Principled Volume | Shader | ❌ Not planned | — | Volumes |
| Ray Portal BSDF | Shader | ❌ Not planned | — | Path-tracing only |
| Refraction BSDF | Shader | 🚧 Not yet | 8 | Screen-space transmission |
| Sheen BSDF | Shader | 🚧 Not yet | 10 | Maps onto physical sheen |
| Specular BSDF | Shader | 🚧 Not yet | 8 | Eevee-only node; maps onto physical params |
| Subsurface Scattering | Shader | 🚧 Not yet | 10 | Thickness/translucency fake |
| Toon BSDF | Shader | 🚧 Not yet | 10 | Custom lighting |
| Translucent BSDF | Shader | 🚧 Not yet | 10 | Fake |
| Transparent BSDF | Shader | 🚧 Not yet | 8 | Alpha blending |
| Volume Absorption | Shader | ❌ Not planned | — | Volumes |
| Volume Coefficients | Shader | ❌ Not planned | — | Volumes. Blender 5.x |
| Volume Scatter | Shader | ❌ Not planned | — | Volumes |

### Texture

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Brick Texture | Texture | ✅ Supported | 6 | |
| Checker Texture | Texture | ✅ Supported | 3 | Texture Mapping sidebar settings not supported |
| Environment Texture | Texture | ✅ Supported | 6 | Equirectangular and Mirror Ball. Float (HDR) images are embedded as RGBE PNGs (about 1% precision, no alpha) |
| Gabor Texture | Texture | ✅ Supported | 6 | 2D and 3D, all outputs. Blender 4.3+. Expensive (72 kernels per pixel in 2D, 216 in 3D): consider baking on phones |
| Gradient Texture | Texture | ✅ Supported | 3 | Texture Mapping sidebar settings not supported |
| IES Texture | Texture | ❌ Not planned | — | Belongs to lights |
| Image Texture | Texture | 🟡 Partial | 3 | Flat/Box/Sphere/Tube, Linear/Closest, all extensions, Cycles' alpha association, 8-bit and float images (float as RGBE: about 1% precision, no alpha). Not yet: Cubic/Smart (rendered Linear), mipmaps |
| Magic Texture | Texture | ✅ Supported | 6 | |
| Noise Texture | Texture | ✅ Supported | 4 | All types (fBm, multifractal, ridged, hybrid, hetero terrain), 1D–4D, distortion, normalize. Musgrave nodes from older files are converted to Noise by Blender |
| Point Density | Texture | 🧊 Baked | 9 | Blender 4.2 only (removed in 5.x) |
| Sky Texture | Texture | 🟡 Partial | 6 | Every model of Blender 4.2 and 5.x, baked by the exporter with Cycles to a 1024×512 equirectangular RGBE image (the sky models run in Blender's C++ code). Sharp features such as the sun disc and the multiple-scattering horizon are blurred to the bake's resolution; sky settings cannot change live |
| Voronoi Texture | Texture | ✅ Supported | 5 | Every feature and distance metric, 1D–4D, fractal Detail, Normalize. Files from Blender 4.x use 4.x's cell hashing, which gives a different pattern |
| Wave Texture | Texture | ✅ Supported | 6 | |
| White Noise Texture | Texture | ✅ Supported | 4 | Bit-exact Cycles hash. Since the hash depends on the exact float bits of its input, Blender and the browser only agree where the input is computed identically (e.g. snapped coordinates) |

### Color

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Brightness/Contrast | Color | ✅ Supported | 3 | |
| Gamma | Color | ✅ Supported | 3 | |
| Hue/Saturation/Value | Color | ✅ Supported | 3 | |
| Invert Color | Color | ✅ Supported | 3 | |
| Mix | Color | ✅ Supported | 3 | Float, Vector (uniform and non-uniform), Color with all blend modes; clamp factor/result |
| Mix (Legacy) | Color | ✅ Supported | 3 | `MixRGB`; same blend code as Mix |
| RGB Curves | Color | ✅ Supported | 3 | Cycles table incl. extrapolation |

### Vector

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Bump | Vector | 🚧 Not yet | 7 | Screen-space derivatives |
| Displacement | Vector | 🚧 Not yet | 7 | Vertex stage, needs dense mesh |
| Mapping | Vector | ✅ Supported | 2 | Point, Texture, Vector, Normal |
| Normal | Vector | ✅ Supported | 3 | |
| Normal Map | Vector | 🚧 Not yet | 7 | Tangent / object / world; needs glTF tangents |
| Radial Tiling | Vector | 🚧 Not yet | 10 | New in Blender 5. Deferred to phase 10: a large port (≈900 lines of Blender's GLSL) |
| Vector Curves | Vector | ✅ Supported | 3 | Cycles table incl. extrapolation |
| Vector Displacement | Vector | 🚧 Not yet | 7 | Vertex stage, needs dense mesh |
| Vector Rotate | Vector | ✅ Supported | 3 | |
| Vector Transform | Vector | 🚧 Not yet | 7 | |

### Converter

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Blackbody | Converter | 🚧 Not yet | 7 | Fitted formula |
| Clamp | Converter | ✅ Supported | 3 | Min Max and Range |
| Color Ramp | Converter | ✅ Supported | 3 | Every interpolation and color mode; 257-entry table like Cycles |
| Combine Color | Converter | ✅ Supported | 3 | RGB, HSV, HSL |
| Combine HSV / Combine RGB | Converter | ✅ Supported | 3 | Legacy, Blender 4.2 only; same code as Combine Color |
| Combine XYZ | Converter | ✅ Supported | 3 | |
| Float Curve | Converter | ✅ Supported | 3 | Cycles table incl. extrapolation |
| Map Range | Converter | ✅ Supported | 3 | All interpolation types, float and vector |
| Math | Converter | ✅ Supported | 3 | All operations and Clamp; Cycles semantics (safe divide, pow, modulo …) |
| RGB to BW | Converter | ✅ Supported | 3 | |
| Script | Converter | ❌ Not planned | — | OSL not possible in realtime |
| Separate Color | Converter | ✅ Supported | 3 | RGB, HSV, HSL |
| Separate HSV / Separate RGB | Converter | ✅ Supported | 3 | Legacy, Blender 4.2 only; same code as Separate Color |
| Separate XYZ | Converter | ✅ Supported | 3 | |
| Shader to RGB | Converter | 🚧 Not yet | 10 | Needs custom lighting inside the material |
| Squeeze Value (Legacy) | Converter | 🟡 Partial | 3 | EEVEE formula. Cycles doesn't implement this node, so there is no parity test |
| Vector Math | Converter | ✅ Supported | 3 | All operations (Power, Sign, Round need Blender 4.3+/5.x); Cycles semantics |
| Wavelength | Converter | 🚧 Not yet | 7 | |

### Output, light and other

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| AOV Output | Output | ❌ Not planned | — | |
| Light Falloff | Light | ❌ Not planned | — | Belongs to lights |
| Light Output | Output | ❌ Not planned | — | |
| Line Style Output | Output | ❌ Not planned | — | Freestyle only |
| Material Output | Output | 🟡 Partial | 2 | Surface only so far (Displacement in phase 7) |
| Raycast | Input | ❌ Not planned | — | Blender 5.x. Needs scene ray tracing |
| UV Along Stroke | Input | ❌ Not planned | — | Freestyle only |
| World Output | Output | 🟡 Partial | 6 | Surface only (no Volume). See Background |

### Layout

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Frame | Layout | ✅ Supported | 1 | Removed by exporter |
| Group / Group Input / Group Output | Layout | ✅ Supported | 1 | Flattened by exporter |
| Reroute | Layout | ✅ Supported | 1 | Removed by exporter |

<!-- node-table:end -->
