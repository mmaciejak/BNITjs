import type { NodeImpl, NodeRegistry } from '../graph/evaluate.js';
import { attribute } from './attribute.js';
import { bswValue } from './bswValue.js';
import { cameraData } from './cameraData.js';
import { checker } from './checker.js';
import { clamp } from './clamp.js';
import { colorAttribute } from './colorAttribute.js';
import { colorRamp } from './colorRamp.js';
import { floatCurve } from './floatCurve.js';
import { fresnel } from './fresnel.js';
import { glossy } from './glossy.js';
import { gradient } from './gradient.js';
import { rgbCurves } from './rgbCurves.js';
import { vectorCurves } from './vectorCurves.js';
import { combineColor } from './combineColor.js';
import { combineHSV, combineRGB } from './combineLegacy.js';
import { hueSaturation } from './hueSaturation.js';
import { imageTexture } from './imageTexture.js';
import { layerWeight } from './layerWeight.js';
import { mix } from './mix.js';
import { noise } from './noise.js';
import { mixRGB } from './mixRGB.js';
import { normal } from './normal.js';
import { objectInfo } from './objectInfo.js';
import { separateColor } from './separateColor.js';
import { separateHSV, separateRGB } from './separateLegacy.js';
import { brightContrast } from './brightContrast.js';
import { gamma } from './gamma.js';
import { invertColor } from './invert.js';
import { rgbToBW } from './rgbToBw.js';
import { squeeze } from './squeeze.js';
import { mapRange } from './mapRange.js';
import { vectorRotate } from './vectorRotate.js';
import { diffuse } from './diffuse.js';
import { emission } from './emission.js';
import { mapping } from './mapping.js';
import { math } from './math.js';
import { materialOutput } from './output.js';
import { principled } from './principled.js';
import { rgb } from './rgb.js';
import { texCoord } from './texCoord.js';
import { uvMap } from './uvMap.js';
import { value } from './value.js';
import { vectorMath } from './vectorMath.js';
import { whiteNoise } from './whiteNoise.js';
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
  ShaderNodeFresnel: fresnel,
  ShaderNodeLayerWeight: layerWeight,
  ShaderNodeObjectInfo: objectInfo,
  ShaderNodeNormal: normal,
  ShaderNodeCameraData: cameraData,
  ShaderNodeUVMap: uvMap,
  ShaderNodeVertexColor: colorAttribute,
  ShaderNodeAttribute: attribute,
  ShaderNodeBsdfDiffuse: diffuse,
  ShaderNodeBsdfAnisotropic: glossy,
  ShaderNodeTexImage: imageTexture,
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
