import type { NodeImpl, NodeRegistry } from '../graph/evaluate.js';
import { attribute } from './attribute.js';
import { background } from './background.js';
import { brick } from './brick.js';
import { eeveeSpecular, glass, metallic, refraction } from './bsdfs.js';
import { bump } from './bump.js';
import { blackbody, wavelength } from './spectral.js';
import { bswValue } from './bswValue.js';
import { cameraData } from './cameraData.js';
import { checker } from './checker.js';
import { clamp } from './clamp.js';
import { colorAttribute } from './colorAttribute.js';
import { colorRamp } from './colorRamp.js';
import { floatCurve } from './floatCurve.js';
import { fresnel } from './fresnel.js';
import { gabor } from './gabor.js';
import { geometry } from './geometry.js';
import { glossy } from './glossy.js';
import { gradient } from './gradient.js';
import { rgbCurves } from './rgbCurves.js';
import { vectorCurves } from './vectorCurves.js';
import { combineColor } from './combineColor.js';
import { combineHSV, combineRGB } from './combineLegacy.js';
import { hueSaturation } from './hueSaturation.js';
import { imageTexture } from './imageTexture.js';
import { layerWeight } from './layerWeight.js';
import { magic } from './magic.js';
import { mix } from './mix.js';
import { noise } from './noise.js';
import { mixRGB } from './mixRGB.js';
import { normal } from './normal.js';
import { normalMap } from './normalMap.js';
import { objectInfo } from './objectInfo.js';
import { separateColor } from './separateColor.js';
import { addShader, holdout, mixShader, transparent } from './shaderNodes.js';
import { skyTexture } from './skyTexture.js';
import { separateHSV, separateRGB } from './separateLegacy.js';
import { brightContrast } from './brightContrast.js';
import { gamma } from './gamma.js';
import { invertColor } from './invert.js';
import { rgbToBW } from './rgbToBw.js';
import { squeeze } from './squeeze.js';
import { tangent } from './tangent.js';
import { mapRange } from './mapRange.js';
import { vectorRotate } from './vectorRotate.js';
import { vectorTransform } from './vectorTransform.js';
import { diffuse } from './diffuse.js';
import { displacement, vectorDisplacement } from './displacement.js';
import { emission } from './emission.js';
import { environmentTexture } from './environmentTexture.js';
import { sheen, subsurface, translucent } from './hardBsdfs.js';
import { lightPath } from './lightPath.js';
import { mapping } from './mapping.js';
import { math } from './math.js';
import { materialOutput } from './output.js';
import { principled } from './principled.js';
import { rgb } from './rgb.js';
import { shaderToRGB } from './shaderToRGB.js';
import { texCoord } from './texCoord.js';
import { toon } from './toon.js';
import { uvMap } from './uvMap.js';
import { value } from './value.js';
import { vectorMath } from './vectorMath.js';
import { voronoi } from './voronoi.js';
import { wave } from './wave.js';
import { whiteNoise } from './whiteNoise.js';
import { wireframe } from './wireframe.js';
import { worldOutput } from './worldOutput.js';
import { combineXYZ, separateXYZ } from './xyz.js';

/**
 * Blender node type (bl_idname) -> TSL implementation.
 *
 * Every type listed here must be ✅ or 🟡 in schema/node-support.json and vice versa
 * (tests/registry.test.ts checks it), so the README table matches the code.
 */
export const builtinNodes: Record<string, NodeImpl> = {
  BSW_Value: bswValue,
  ShaderNodeOutputMaterial: materialOutput,
  ShaderNodeOutputWorld: worldOutput,
  ShaderNodeBackground: background,
  ShaderNodeEmission: emission,
  ShaderNodeMapping: mapping,
  ShaderNodeMath: math,
  ShaderNodeVectorMath: vectorMath,
  ShaderNodeClamp: clamp,
  ShaderNodeMapRange: mapRange,
  ShaderNodeVectorRotate: vectorRotate,
  ShaderNodeInvert: invertColor,
  ShaderNodeGamma: gamma,
  ShaderNodeBrightContrast: brightContrast,
  ShaderNodeRGBToBW: rgbToBW,
  ShaderNodeSqueeze: squeeze,
  ShaderNodeSeparateColor: separateColor,
  ShaderNodeCombineColor: combineColor,
  ShaderNodeSeparateRGB: separateRGB,
  ShaderNodeSeparateHSV: separateHSV,
  ShaderNodeCombineRGB: combineRGB,
  ShaderNodeCombineHSV: combineHSV,
  ShaderNodeHueSaturation: hueSaturation,
  ShaderNodeMix: mix,
  ShaderNodeMixRGB: mixRGB,
  ShaderNodeValToRGB: colorRamp,
  ShaderNodeRGBCurve: rgbCurves,
  ShaderNodeVectorCurve: vectorCurves,
  ShaderNodeFloatCurve: floatCurve,
  ShaderNodeTexChecker: checker,
  ShaderNodeTexGradient: gradient,
  ShaderNodeTexWhiteNoise: whiteNoise,
  ShaderNodeTexNoise: noise,
  ShaderNodeTexVoronoi: voronoi,
  ShaderNodeTexWave: wave,
  ShaderNodeTexMagic: magic,
  ShaderNodeTexBrick: brick,
  ShaderNodeTexGabor: gabor,
  ShaderNodeFresnel: fresnel,
  ShaderNodeLayerWeight: layerWeight,
  ShaderNodeObjectInfo: objectInfo,
  ShaderNodeNormal: normal,
  ShaderNodeCameraData: cameraData,
  ShaderNodeLightPath: lightPath,
  ShaderNodeUVMap: uvMap,
  ShaderNodeVertexColor: colorAttribute,
  ShaderNodeAttribute: attribute,
  ShaderNodeBsdfDiffuse: diffuse,
  ShaderNodeBsdfAnisotropic: glossy,
  ShaderNodeTexImage: imageTexture,
  ShaderNodeTexEnvironment: environmentTexture,
  ShaderNodeTexSky: skyTexture,
  ShaderNodeBlackbody: blackbody,
  ShaderNodeWavelength: wavelength,
  ShaderNodeNewGeometry: geometry,
  ShaderNodeTangent: tangent,
  ShaderNodeBump: bump,
  ShaderNodeNormalMap: normalMap,
  ShaderNodeVectorTransform: vectorTransform,
  ShaderNodeDisplacement: displacement,
  ShaderNodeVectorDisplacement: vectorDisplacement,
  ShaderNodeWireframe: wireframe,
  ShaderNodeMixShader: mixShader,
  ShaderNodeAddShader: addShader,
  ShaderNodeBsdfTransparent: transparent,
  ShaderNodeBsdfGlass: glass,
  ShaderNodeEeveeSpecular: eeveeSpecular,
  ShaderNodeBsdfMetallic: metallic,
  ShaderNodeBsdfRefraction: refraction,
  ShaderNodeBsdfSheen: sheen,
  ShaderNodeBsdfToon: toon,
  ShaderNodeHoldout: holdout,
  ShaderNodeShaderToRGB: shaderToRGB,
  ShaderNodeBsdfTranslucent: translucent,
  ShaderNodeSubsurfaceScattering: subsurface,
  ShaderNodeBsdfPrincipled: principled,
  ShaderNodeRGB: rgb,
  ShaderNodeTexCoord: texCoord,
  ShaderNodeValue: value,
  ShaderNodeSeparateXYZ: separateXYZ,
  ShaderNodeCombineXYZ: combineXYZ,
};

/** The built-in registry, optionally extended or overridden with custom node implementations. */
export function createRegistry(extra: Record<string, NodeImpl> = {}): NodeRegistry {
  return new Map(Object.entries({ ...builtinNodes, ...extra }));
}
