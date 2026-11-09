# BNITjs

Take a Blender material built from shader nodes, export it with a Blender add-on, and evaluate the procedural material **live in the browser** with three.js TSL. No baked textures are needed for supported nodes.

- **`exporter/`**: Blender add-on (4.2 LTS+). It writes the material node graph into the glTF file under a vendor extension (`EXT_blender_shader_graph`), with a standard PBR material as the fallback.
- **`runtime/`**: TypeScript npm package. A GLTFLoader plugin rebuilds the graph as TSL on `MeshPhysicalNodeMaterial` (rendered with `WebGPURenderer`, which falls back to WebGL2).
- **`parity/`**: a visual parity harness that compares Blender reference renders with browser renders, pixel by pixel.

Repository: <https://github.com/mmaciejak/BNITjs>. See [SPEC.md](SPEC.md) for the full design and roadmap.

> **Status:** Phase 9 done. Every texture node except Radial Tiling is live (Noise, Voronoi, Wave, Gabor and the rest match Blender), as are bump, normal and displacement mapping, shader mixing and the physical Principled inputs. The World can be shown as the background. Nodes that can't run live (Ambient Occlusion, Bevel …) are baked at export, a material can also be baked into the standard glTF material for model-viewer, and `bakeMaterial` bakes in the browser. 465 parity scenes match Blender on WebGPU and WebGL2. Phase 10 (hard-tier approximations) is next.

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

`tools/check.sh` runs every suite: Python lint, node-table sync, exporter tests on Blender 4.2 and 5.2, runtime lint, typecheck, tests and build, the parity harness on WebGPU and WebGL2, and the configurator and materials examples on both backends. Run it before every commit; it keeps the Mac awake while it runs.

GitHub Actions doesn't run on every push. The `CI` workflow (lint, runtime and exporter tests) runs before each release and can be started from the Actions tab. The `Parity` workflow is manual only: the runners have no GPU, so it can only compare against WebGL2 rendered in software. The real parity check is `tools/check.sh`.

To release, set the same version in `runtime/package.json` and `exporter/blender_manifest.toml`, then push a tag `vX.Y.Z`. The `Release` workflow runs the checks, builds the extension zip (`bnitjs-X.Y.Z.zip`) and the npm tarball (`bnitjs-X.Y.Z.tgz`), and attaches both to a GitHub Release (marked as a pre-release for 0.x). Starting it from the Actions tab builds the files without making a release. Nothing is published to npm or extensions.blender.org yet.

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
import { registerBlenderShaderGraph } from 'bnitjs';

const renderer = new WebGPURenderer(); // falls back to WebGL2
const loader = registerBlenderShaderGraph(new GLTFLoader());
const gltf = await loader.loadAsync('model.gltf'); // materials rebuilt from their node graphs
```

Nodes that aren't supported yet log a warning and use a default value; a material that fails to build falls back to the standard glTF material in the same file.

### World

The exporter also writes the scene's World (its active World Output) to the glTF file. To show it as the background:

```js
import { Scene } from 'three/webgpu';
import { applyBlenderWorld, getBlenderWorld } from 'bnitjs';

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

`examples/materials` shows product materials (car paint with coat, glass, fabric with sheen, a soap film, brushed metal, Glass and Metallic BSDFs, a Mix Shader) under a baked Sky World: `cd runtime && npm run example -- materials`. three.js's BSDFs are not Cycles', so lit materials look close to Blender, not identical.

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
- Above these limits, bake the material in the browser (below), or in Blender.

### In-browser bake

`bakeMaterial` renders a material's procedural inputs into textures once, so a slow device samples a few textures per pixel instead of running the node graph:

```js
import { bakeMaterial, getParams } from 'bnitjs';

const baked = bakeMaterial(renderer, mesh, { size: 1024, updateOnParamChange: true });
mesh.material = baked.material;      // a copy whose inputs sample the textures
getParams(baked.material)?.set('Wood/Color', [0.6, 0.3, 0.1]); // bakes again
baked.dispose();                     // frees the textures
```

It bakes base color, opacity, roughness, metalness, emission and the normal, in the UV space of the mesh's first UV map (`uv`). Other inputs (coat, sheen, transmission …) stay live. The UV layout must not overlap. Inputs that depend on the view (Incoming, Fresnel, Layer Weight, Camera Data, Window) are baked as seen from the world origin. The normal is baked in object space, so it follows the mesh as it moves but not as it deforms (skinning, morph targets). Call `baked.update()` after anything else the bake depends on changes. Without `updateOnParamChange`, that includes live parameters.

### Using the exporter

1. Install the extension zip (from [GitHub Releases](https://github.com/mmaciejak/BNITjs/releases)): Edit › Preferences › Get Extensions › ⌄ › Install from Disk…
2. Export with File › Export › glTF 2.0 as usual. Every material gets its node graph in the `EXT_blender_shader_graph` extension; the normal PBR material stays in the file as a fallback.
3. Material Properties › **BNITjs (three.js)** lists the nodes that the runtime can't evaluate live yet.

Nodes the runtime can't evaluate live (Ambient Occlusion, Bevel, and nodes that aren't supported yet) are baked at export. Cycles bakes each of their linked outputs into a texture on the object's UV map, and the exported graph samples that texture instead. Everything downstream of the baked node stays live, but its inputs can no longer change live, and live parameters that only fed it are dropped. Baking needs a mesh with a UV map. When several objects share the material, it is baked on one of them, and the others reuse that texture through their own UV maps. Ambient Occlusion sees the scene's other visible objects. The settings (on/off, resolution, samples, margin) are in the glTF export dialog under **BNITjs (three.js)**. Shader outputs (BSDFs) can't be baked this way.

#### Viewers without the runtime (model-viewer)

**Bake PBR Fallback** (off by default) also bakes each material into the standard glTF material that viewers without BNITjs show, such as model-viewer, Babylon.js or the glTF viewers in game engines. The baked channels are base color with alpha, metallic and roughness, a tangent-space normal map, and emission (with `KHR_materials_emissive_strength` above 1):

- **Principled BSDF:** every linked input is baked on its own. Unlinked inputs become factors.
- **Emission shader:** its color × strength becomes the emission, over a black base color.
- **Other shaders** (Mix Shader, Diffuse, Glass …): Cycles' Diffuse Color, Roughness and Emit passes, with metallic 0. This is an approximation.

A normal map is baked when a Normal input or the Displacement output is linked. With **Node Graphs** on (the default), the same file carries the live graph for three.js and the baked material for everything else. Turn Node Graphs off for a plain glTF file. `examples/model-viewer-fallback` shows one file in both.

Workflow rules (SPEC §4): one commit per feature, using the `type(scope): message` style. Every commit that changes node support also updates the table below. Each phase ends with a `phase-N` tag and a `CHANGELOG.md` entry.

## Node support

<!-- node-table:start (generated by tools/sync_node_support.py from schema/node-support.json) -->

✅ Supported · 🟡 Partial · 🚧 Not yet · 🧊 Baked · ❌ Not planned

This table lists every shader node in Blender 4.2 LTS and 5.2 LTS. Nodes that exist in only one of those versions are marked in Notes.

### Input

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Ambient Occlusion | Input | 🧊 Baked | 9 | Baked by the exporter with Cycles into a texture on the UV map (needs a UV map); the scene's other visible objects occlude it. Or leave it out and use the scene's SSAO |
| Attribute | Input | 🟡 Partial | 3 | Geometry type: color attributes, UV maps and "_" custom attributes (glTF Attributes option). Instancer/Object/View Layer types not supported |
| Bevel | Input | 🧊 Baked | 9 | Baked by the exporter with Cycles into a texture on the UV map (needs a UV map). The baked Normal is in world space |
| Camera Data | Input | ✅ Supported | 3 | |
| Color | Input | ✅ Supported | 2 | Named "RGB" in 4.2 |
| Color Attribute | Input | 🟡 Partial | 3 | By name or render-active, via the exporter's COLOR_n layout; ambiguous when the standard material also uses a color attribute and the mesh has several |
| Curves Info | Input | ❌ Not planned | — | Out of scope for mesh materials |
| Fresnel | Input | ✅ Supported | 3 | Front faces |
| Geometry | Input | 🟡 Partial | 7 | Position, Normal, Tangent, True Normal, Incoming, Backfacing. Not yet (0): Parametric, Random Per Island (exported as an attribute), Pointiness (🧊 baked to a vertex attribute) |
| Layer Weight | Input | ✅ Supported | 3 | Front faces |
| Light Path | Input | 🟡 Partial | 10 | Seen by a camera ray, as everything a rasterizer shades: Is Camera Ray 1, the other ray types and depths 0 (parity-tested). Ray Length is the camera ray's length from the near clip plane, as in Cycles (parity-tested, both cameras). Effects that depend on other ray types (hiding from shadows or reflections) do not apply |
| Object Info | Input | ✅ Supported | 3 | Random matches Cycles for non-instanced objects (name hash) |
| Particle Info | Input | ❌ Not planned | — | Out of scope for mesh materials |
| Point Info | Input | ❌ Not planned | — | Out of scope for mesh materials |
| Tangent | Input | 🟡 Partial | 7 | Radial X/Y/Z. Not yet: UV Map tangents (rendered as Radial Z) |
| Texture Coordinate | Input | 🟡 Partial | 2 | All outputs pass parity (ortho and perspective). Not supported yet: the Object setting (another object's space) and From Instancer |
| UV Map | Input | ✅ Supported | 3 | Resolves names via the exported UV map list; From Instancer not supported |
| Value | Input | ✅ Supported | 2 | |
| Volume Info | Input | ❌ Not planned | — | Volumes |
| Wireframe | Input | 🟡 Partial | 7 | World size parity-tested (wire coverage matches; hard edges are anti-aliased differently). Pixel Size follows Cycles but is not parity-tested. Meshes that use it are de-indexed on load to get per-triangle barycentrics |

### Shader

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Add Shader | Shader | 🟡 Partial | 8 | Emission and Transparent add exactly (parity-tested for emission); emission added to a BSDF becomes its emission; two BSDFs are summed by their parameters (approximation) |
| Background | Shader | 🟡 Partial | 6 | Shown as the scene background with applyBlenderWorld(scene, gltf). The world does not light the scene yet (set scene.environment yourself) |
| Diffuse BSDF | Shader | 🟡 Partial | 3 | Physical material without specular (color parity-tested). Oren-Nayar roughness not mapped |
| Emission | Shader | ✅ Supported | 2 | |
| Glass BSDF | Shader | 🟡 Partial | 8 | three.js physical transmission with IOR, roughness, Color tint and thin film (screen-space transmission; close, not identical to Cycles) |
| Glossy BSDF | Shader | 🟡 Partial | 3 | Fully metallic physical material with the same roughness, Normal and anisotropy (needs mesh tangents; the Tangent input is ignored). No parity test (lighting differs) |
| Hair BSDF | Shader | 🚧 Not yet | 10 | Likely ❌ |
| Holdout | Shader | 🟡 Partial | 10 | Writes transparent black without blending and still writes depth: a hole in the frame that shows the page behind a transparent canvas and hides objects behind it, like a holdout with a transparent film (parity-tested against Cycles' black). Mixed or added to other shaders it is rendered as Transparent |
| Metallic BSDF | Shader | 🟡 Partial | 8 | Metal with Base Color reflectance, roughness, anisotropy and thin film. Not mapped: Edge Tint, Physical Conductor (IOR, Extinction) |
| Mix Shader | Shader | 🟡 Partial | 8 | Emission and Transparent mix exactly (parity-tested for emission). BSDFs are mixed by their parameters: exact for Principled pairs differing in colors, approximate otherwise. Transparency uses straight alpha blending, exact only when blending in linear space |
| Principled BSDF | Shader | 🟡 Partial | 2 | Base color, metallic, roughness, alpha, emission (base color parity-tested), Normal, and three.js physical equivalents of coat, sheen, transmission, IOR, specular level and tint, thin film and anisotropy (close, not identical to Cycles; see examples/materials). Not mapped: subsurface, coat IOR and tint |
| Principled Hair BSDF | Shader | 🚧 Not yet | 10 | Likely ❌ |
| Principled Volume | Shader | ❌ Not planned | — | Volumes |
| Ray Portal BSDF | Shader | ❌ Not planned | — | Path-tracing only |
| Refraction BSDF | Shader | 🟡 Partial | 8 | Physical transmission without the specular reflection (close, not identical to Cycles) |
| Sheen BSDF | Shader | 🟡 Partial | 10 | three.js physical sheen (Charlie) over a black, non-specular base: Color, Roughness, Normal. Ashikhmin is rendered as Charlie. Lighting differs from Cycles, so no parity test |
| Specular BSDF | Shader | 🟡 Partial | 8 | EEVEE-only (Cycles renders it black): mapped like EEVEE onto the physical material (base color, specular color, roughness, emission, transparency, clear coat) |
| Subsurface Scattering | Shader | 🟡 Partial | 10 | Rendered as a diffuse surface of its Color (with Normal). Radius, Scale, IOR, Roughness and Anisotropy are reported and ignored: three.js has no subsurface scattering. No parity test (lighting differs) |
| Toon BSDF | Shader | 🟡 Partial | 10 | Diffuse component on three.js's toon material, with a gradient that reproduces Cycles' toon lobe for direct light (Size and Smooth must be constant). Lit by three.js lights and ambient light only: like three.js's toon material, it ignores scene.environment. The Glossy component is rendered as Diffuse. Mixed with other shaders, it is approximated by a diffuse surface. No parity test (lighting differs) |
| Translucent BSDF | Shader | 🟡 Partial | 10 | Lambertian reflection on the side opposite the normal, which is a diffuse physical material with the normal reversed (exact for three.js's lights). Light is not attenuated through the object. No parity test (lighting differs) |
| Transparent BSDF | Shader | 🟡 Partial | 8 | Opacity for Mix/Add Shader (straight alpha blending, exact only when blending in linear space). A tinted Color is rendered untinted |
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
| Point Density | Texture | 🧊 Baked | 9 | Blender 4.2 only (removed in 5.x). Baked by the exporter like Ambient Occlusion |
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
| Bump | Vector | ✅ Supported | 7 | Cycles' formula on screen-space derivatives of the height (parity-tested). The Filter Width input has no effect |
| Displacement | Vector | 🟡 Partial | 7 | Object and World space (parity-tested). Material Settings > Displacement: Bump Only (the default) shades with the displaced surface's normal; Displacement moves the vertices (needs a dense mesh; normals are not recomputed); Displacement and Bump is treated as Displacement |
| Mapping | Vector | ✅ Supported | 2 | Point, Texture, Vector, Normal |
| Normal | Vector | ✅ Supported | 3 | |
| Normal Map | Vector | 🟡 Partial | 7 | Every space and Strength (parity-tested). Tangent space builds its frame from screen-space derivatives of the UV map instead of MikkTSpace tangents: exact on flat, uniformly mapped surfaces, close on curved ones |
| Radial Tiling | Vector | 🚧 Not yet | 10 | New in Blender 5. Deferred to phase 10: a large port (≈900 lines of Blender's GLSL) |
| Vector Curves | Vector | ✅ Supported | 3 | Cycles table incl. extrapolation |
| Vector Displacement | Vector | 🟡 Partial | 7 | Object and World space (parity-tested), as Displacement. Not yet: Tangent space (treated as Object) |
| Vector Rotate | Vector | ✅ Supported | 3 | |
| Vector Transform | Vector | ✅ Supported | 7 | |

### Converter

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| Blackbody | Converter | ✅ Supported | 7 | Interpolates a table measured from Cycles (tools/measure_spectra.py); same in Blender 4.2 and 5.2 |
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
| Shader to RGB | Converter | 🟡 Partial | 10 | EEVEE only (Cycles does not support it). Emission and Transparent inputs are exact. A BSDF gives its color lit by three.js when the result reaches the Material Output through an Emission shader (the usual toon setup); otherwise, in unlit mode, or for a second BSDF in one material, its base color stands in |
| Squeeze Value (Legacy) | Converter | 🟡 Partial | 3 | EEVEE formula. Cycles doesn't implement this node, so there is no parity test |
| Vector Math | Converter | ✅ Supported | 3 | All operations (Power, Sign, Round need Blender 4.3+/5.x); Cycles semantics |
| Wavelength | Converter | ✅ Supported | 7 | Interpolates a table measured from Cycles (tools/measure_spectra.py), including Cycles' extension down to 375 nm |

### Output, light and other

| Node | Category | Status | Phase | Notes |
|---|---|---|---|---|
| AOV Output | Output | ❌ Not planned | — | |
| Light Falloff | Light | ❌ Not planned | — | Belongs to lights |
| Light Output | Output | ❌ Not planned | — | |
| Line Style Output | Output | ❌ Not planned | — | Freestyle only |
| Material Output | Output | 🟡 Partial | 2 | Surface and Displacement (see Displacement). Volume is not supported |
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
