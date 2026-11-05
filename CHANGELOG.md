# Changelog

Each phase from [SPEC.md](SPEC.md) gets an entry when it is tagged (`phase-N`).

## phase-8: Shader combination and advanced Principled

- Principled BSDF maps its advanced inputs onto three.js's physical material: coat (weight, roughness, normal), sheen, transmission, IOR, specular IOR level and tint, thin film and anisotropy. Subsurface, Coat IOR and Coat Tint are reported and ignored.
- Mix Shader and Add Shader (🟡) combine closures by their parameters. Emission and Transparent mix exactly, as radiance and opacity, and are parity-tested for emission. BSDF pairs are mixed parameter by parameter: exact for Principled pairs that differ only in colors, approximate otherwise.
- New BSDFs (🟡), mapped onto the physical material:
  - Transparent.
  - Glass: transmission with IOR.
  - Refraction: transmission without reflection.
  - Metallic: Edge Tint and Physical Conductor are not mapped.
  - Specular: EEVEE-only, mapped like EEVEE.
- `examples/materials` shows car paint, glass, fabric, a soap film, brushed metal, Glass and Metallic BSDFs and a Mix Shader under a baked Sky World. Its check, part of `check.sh`, fails on shader errors or warnings on WebGPU and WebGL2. Lit materials are close to Blender, not identical, because three.js's BSDFs differ from Cycles'.
- Transparency uses straight alpha blending, which is exact only when blending happens in linear space.
- Parity harness: a scene that fails is run once more before it counts as failed (printed as RETRY), after a one-off bad capture on WebGL2. 463 scenes pass on WebGPU and WebGL2.
- During this phase, the Glass BSDF commit (`e776a23`) went in after a check that failed on that one-off capture. The next full check, which included that code, passed.

## phase-7: Surface detail and geometry

- New supported nodes (✅): Bump, Vector Transform, Blackbody and Wavelength. Bump follows Cycles' formula on screen-space derivatives, which gives the same result because it does not depend on the size of the differences. Blackbody and Wavelength use tables measured from Cycles with `tools/measure_spectra.py`, because Blender computes them from tables in its C++ code.
- Partial (🟡, limits in the README):
  - Geometry: Position, Normal, Tangent, True Normal, Incoming and Backfacing. Pointiness, Random Per Island and Parametric are not done yet.
  - Tangent: Radial X/Y/Z.
  - Normal Map: every space and Strength. Tangent space builds its frame from screen-space derivatives instead of MikkTSpace tangents.
  - Displacement and Vector Displacement: object and world space.
  - Wireframe: world size is parity-tested; meshes that use it get barycentrics from the loader.
- Principled, Diffuse and Glossy use a linked Normal as the material's shading normal. The exporter writes the material's displacement method. With "Bump Only" (the default), the runtime shades with the displaced surface's normal; with "Displacement", it moves the vertices. Unlit materials respect a displaced normal, as Blender's Emission materials do through Geometry > Normal.
- 459 scenes pass on WebGPU and WebGL2.

## phase-6: Remaining textures and the World

- New supported nodes (✅, ported from Blender's GLSL): Wave, Magic, Brick and Gabor Textures, and Environment Texture.
- Image Texture gains Box projection, with the blend between projections.
- Float (HDR) images are embedded as RGBE PNGs, because glTF only carries PNG and JPEG. The runtime decodes each texel before interpolating, like Cycles: about 1% precision, and alpha is lost.
- The World is exported from its active World Output and stored on the glTF scene. `applyBlenderWorld(scene, gltf)` shows it as `scene.backgroundNode`, and texture coordinates in a World are the view direction. Background and World Output are 🟡: the World does not light the scene yet.
- Sky Texture (🟡) covers every model of Blender 4.2 and 5.x. Those models run in Blender's C++ code, so the exporter bakes each Sky node with a Cycles equirectangular panorama to a 1024×512 RGBE image. The panorama camera's rotation was measured to match Environment Texture's mapping. Sharp features are blurred to the bake's resolution, and sky settings cannot change live.
- Radial Tiling (new in Blender 5) is deferred to phase 10: it is a port of about 900 lines.
- Parity harness: scenes can define `build_world()` and `CAMERA_ROTATION`, and the browser renders into a `Scene` with the World applied. A scene that times out is retried once, and `check.sh` keeps the Mac awake with `caffeinate`. 420 scenes pass on WebGPU and WebGL2.

## phase-5: Voronoi

- Voronoi Texture (✅): every feature (F1, F2, Smooth F1, Distance to Edge, N-Sphere Radius) and distance metric, 1D–4D, fractal Detail with fractional interpolation, and Normalize. It is ported from Blender's GLSL, which matches Cycles. Octaves run in real shader loops, so Detail can be a live parameter.
- Blender 5 hashes Voronoi cells as integers (PCG), while Blender 4.x hashes them as floats, so the same material gives a different pattern in each. The runtime picks the variant from the Blender version recorded in the export. `voronoi_legacy` scenes are rendered with 4.2 to cover the 4.x variant. The switch is assumed to be at 5.0: only 4.2 and 5.2 were tested.
- Parity: 90 Voronoi scenes. Borders between cells are discontinuous, so for outputs that jump at borders (Color, Position, W, Radius), Cycles' random pixel samples and the browser's sample grid disagree on border pixels. Those scenes allow a share of outlier pixels, up to 8% for 2D F2 Color with fractal Detail. All 374 scenes pass on WebGPU and WebGL2.
- Noise and White Noise were checked against Blender 4.2 renders as well: the output is identical.
- The performance check covers Voronoi. The README table was re-measured in a single run.

## phase-4: Noise

- White Noise Texture (✅, 1D–4D): a bit-exact port of Cycles' lookup3 hashes, emitted as shared shader functions. JS versions of the hashes compute constants on the CPU.
- Noise Texture (✅): every type (fBm, multifractal, ridged, hybrid, hetero terrain), 1D–4D, Distortion and Normalize, ported from Cycles. Octaves run in real shader loops, so Detail can be a live parameter.
- Parity: 40 new scenes. They cover every type in each dimension, plus sweeps of Detail (0, 4, 15, fractional), Roughness, Lacunarity, Normalize, Scale and Distortion, and coordinates past 100000 and 1e6. All 284 scenes pass on WebGPU and WebGL2.
- Performance check (`parity/perf_cases.py`, `npm run perf`). The README lists the measured costs and recommended Detail limits.

## phase-3: Easy tier and live parameters

- Every easy-tier node from SPEC §8 is live. Supported (✅, parity-tested): Math and Vector Math (all operations), Clamp, Map Range, Vector Rotate, Separate/Combine XYZ, Separate/Combine Color (RGB/HSV/HSL) and the legacy RGB/HSV nodes, Mix (all 19 blend modes) and legacy Mix, Invert, Brightness/Contrast, Gamma, Hue/Saturation/Value, RGB to BW, Color Ramp, RGB/Float/Vector Curves, Checker, Gradient, Fresnel, Layer Weight, UV Map, Object Info, Camera Data, Normal.
- Partial (🟡, limits listed in the README): Attribute, Color Attribute, Texture Coordinate, Diffuse BSDF, Glossy BSDF, Principled BSDF, Image Texture, Squeeze Value (Legacy), Material Output.
- Live parameters: label a Value or Color node `$Name`, or a group node `$Group` (which exposes its unlinked inputs as `Group/Input`). Then use `material.params.set(...)`; the change takes effect without a rebuild. The parameters survive GLTFLoader's material cloning.
- `examples/configurator` builds its controls from the parameters, with an automated check that runs in `check.sh` and CI.
- Exporter additions:
  - Images are embedded in the glTF.
  - UV map names, the color attribute → COLOR_n layout, object Random (Cycles' name hash), the material pass index and the Normal node direction are exported.
  - Ramps and curves use Cycles' 257-entry tables (measured), and RGB Curves bake the combined curve like Cycles.
- Parity harness additions: scene variants, `setup(plane, variant)`, perspective cameras, scenes limited to older Blender versions (`BLENDER_MAX`), and an outlier allowance for edges and poles. 244 scenes pass on WebGPU and WebGL2.

## phase-2: Runtime core and parity harness

- Runtime: `registerBlenderShaderGraph(loader)` / `BlenderShaderGraphPlugin` for GLTFLoader. It rebuilds materials from `EXT_blender_shader_graph` (falling back to the standard glTF material on error) and stores per-object data in `userData`.
- Graph evaluator with Blender's implicit socket conversions. Unknown nodes produce a warning and a default value, never a crash. Shader sockets carry closures that map onto `MeshPhysicalNodeMaterial` / `MeshBasicNodeMaterial`, with an `unlit` option.
- Nodes: Value, Color, Texture Coordinate (all outputs), Mapping (all types), Emission, Principled BSDF (base inputs), Material Output (Surface).
- Parity harness: Blender Cycles references vs. three.js in headless Chromium (WebGPU and WebGL2), with a pixel diff, per-scene thresholds, diff images and a report. 17 scenes pass with MAE ≤ 0.3 and max ≤ 0.8 levels out of 255.
- Exporter now writes the output values of Value and Color nodes.
- `tools/check.sh` runs every suite.

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
