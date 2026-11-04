/*
 * Image Texture. Follows Cycles' svm_node_tex_image (Blender 5.2) for projections (Flat, Sphere,
 * Tube via map_to_sphere / map_to_tube on (co − 0.5)·2), extension modes and color spaces.
 *
 * 8-bit images are sampled like Cycles' byte images: texels are fetched by index with Cycles'
 * wrapping (Clip reads transparent black outside), associated (rgb·a) per texel for color images
 * unless the Alpha output is connected (data/Non-Color images never are), interpolated on the
 * sRGB-encoded values, then decoded. Mipmaps are not used (Cycles has none).
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import {
  abs,
  acos,
  atan,
  clamp,
  float,
  floor,
  int,
  ivec2,
  max,
  mix,
  pow,
  select,
  sqrt,
  textureLoad,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { NearestFilter, NoColorSpace, type Node, type Texture } from 'three/webgpu';
import type { FloatNode, Vec3Node } from '../graph/convert.js';
import type { NodeContext, NodeImpl } from '../graph/evaluate.js';
import { blenderUV } from './space.js';

type Vec2Node = Node<'vec2'>;

interface ImageRef {
  texture?: number;
  name?: string;
  colorspace?: string;
  alphaMode?: string;
}

function mapToTube(co: Vec3Node): Vec2Node {
  const len = sqrt(co.x.mul(co.x).add(co.y.mul(co.y)));
  const u = float(1)
    .sub(atan(co.x.div(len), co.y.div(len)).div(Math.PI))
    .mul(0.5);
  const v = co.z.add(1).mul(0.5);
  return select(len.greaterThan(0), vec2(u, v), vec2(0, 0));
}

function mapToSphere(co: Vec3Node): Vec2Node {
  const l = co.dot(co);
  const flat = co.x.equal(0).and(co.y.equal(0));
  const u = select(flat, float(0), float(0.5).sub(atan(co.x, co.y).div(2 * Math.PI)));
  const v = float(1).sub(acos(clamp(co.z.div(sqrt(l)), -1, 1)).div(Math.PI));
  return select(l.greaterThan(0), vec2(u, v), vec2(0, 0));
}

/** Cycles' color_srgb_to_linear. */
function srgbToLinear(c: FloatNode): FloatNode {
  return select(c.lessThan(0.04045), max(c, 0).div(12.92), pow(c.add(0.055).div(1.055), 2.4));
}

type Vec4Node = Node<'vec4'>;

/**
 * Cycles' texel wrapping for one axis (kernel/device/cpu/image.h): REPEAT and MIRROR wrap the
 * index, EXTEND clamps it, CLIP marks it invalid (the tap reads transparent black).
 */
function wrapIndex(
  mode: string,
  i: Node<'int'>,
  size: number,
): { index: Node<'int'>; valid: Node<'bool'> | null } {
  const n = int(size);
  // TSL's types don't cover clamp() on ints; it works for any scalar type.
  const clampInt = (v: Node<'int'>) =>
    clamp(v as unknown as Node<'float'>, 0, size - 1) as unknown as Node<'int'>;
  switch (mode) {
    case 'EXTEND':
      return { index: clampInt(i), valid: null };
    case 'CLIP':
      return {
        index: clampInt(i),
        valid: i.greaterThanEqual(0).and(i.lessThan(n)),
      };
    case 'MIRROR': {
      // m = abs(x + (x < 0)) % (2·size); m >= size ? 2·size − m − 1 : m
      const shifted = select(i.lessThan(0), i.add(1), i);
      const m = abs(shifted).mod(n.mul(2));
      return { index: select(m.greaterThanEqual(n), n.mul(2).sub(m).sub(1), m), valid: null };
    }
    default: {
      // REPEAT: positive modulo
      const m = i.mod(n);
      return { index: select(m.lessThan(0), m.add(n), m), valid: null };
    }
  }
}

/**
 * Sample like Cycles' byte-image interpolation: texels are fetched by index (row 0 = Blender's
 * bottom row), optionally associated (rgb·a) per texel, then interpolated (Closest or Linear).
 */
function sampleCycles(
  ctx: NodeContext,
  source: Texture,
  uv: Vec2Node,
  associate: boolean,
): Vec4Node {
  const { width, height } = source.image as { width: number; height: number };
  const tex = source.clone();
  tex.colorSpace = NoColorSpace; // raw bytes; decoded in the shader
  tex.generateMipmaps = false;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  const mode = ctx.prop<string>('extension', 'REPEAT');
  const texel = (ix: Node<'int'>, iy: Node<'int'>): Vec4Node => {
    const x = wrapIndex(mode, ix, width);
    const y = wrapIndex(mode, iy, height);
    // glTF images are stored top-down: Blender row r is image row (height − 1 − r).
    const raw = textureLoad(
      tex,
      ivec2(x.index, int(height - 1).sub(y.index)),
    ) as unknown as Vec4Node;
    const value = associate ? vec4(raw.xyz.mul(raw.w), raw.w) : raw;
    const valid = x.valid && y.valid ? x.valid.and(y.valid) : (x.valid ?? y.valid);
    return valid ? select(valid, value, vec4(0)) : value;
  };

  const interpolation = ctx.prop<string>('interpolation', 'Linear');
  if (interpolation === 'Closest') {
    return texel(int(floor(uv.x.mul(width))), int(floor(uv.y.mul(height))));
  }
  if (interpolation !== 'Linear') ctx.warn(`${interpolation} interpolation is rendered as Linear`);
  const x = uv.x.mul(width).sub(0.5);
  const y = uv.y.mul(height).sub(0.5);
  const fx = x.sub(floor(x));
  const fy = y.sub(floor(y));
  const ix = int(floor(x));
  const iy = int(floor(y));
  const bottom = mix(texel(ix, iy), texel(ix.add(1), iy), fx);
  const top = mix(texel(ix, iy.add(1)), texel(ix.add(1), iy.add(1)), fx);
  return mix(bottom, top, fy);
}

export const imageTexture: NodeImpl = (ctx) => {
  const image = ctx.prop<ImageRef | undefined>('image', undefined);
  const source = image?.texture !== undefined ? ctx.texture(image.texture) : undefined;
  if (!source) {
    ctx.warn(image ? `image "${image.name}" is missing` : 'no image');
    return { Color: vec3(1, 0, 1), Alpha: float(1) };
  }
  const vector = ctx.isLinked('Vector')
    ? ctx.vec3('Vector')
    : blenderUV(ctx.graph.uvMaps?.activeRender ?? 0);

  let uv: Vec2Node;
  const projection = ctx.prop<string>('projection', 'FLAT');
  if (projection === 'SPHERE') uv = mapToSphere(vector.sub(0.5).mul(2));
  else if (projection === 'TUBE') uv = mapToTube(vector.sub(0.5).mul(2));
  else {
    if (projection === 'BOX') ctx.warn('Box projection is rendered as Flat for now');
    uv = vec2(vector.x, vector.y);
  }

  const colorspace = image?.colorspace ?? 'sRGB';
  const isData = /^(Non-Color|Raw)/.test(colorspace);
  const isLinear = colorspace.startsWith('Linear');
  if (!isData && !isLinear && colorspace !== 'sRGB') {
    ctx.warn(`image color space "${colorspace}" is treated as sRGB`);
  }
  const associate =
    !isData &&
    !['CHANNEL_PACKED', 'NONE'].includes(image?.alphaMode ?? 'STRAIGHT') &&
    !ctx.isOutputLinked('Alpha');
  const sample = sampleCycles(ctx, source, uv, associate);
  const raw: Vec3Node = sample.xyz;
  const alpha: FloatNode = sample.w;
  const color: Vec3Node =
    isData || isLinear ? raw : vec3(srgbToLinear(raw.x), srgbToLinear(raw.y), srgbToLinear(raw.z));
  return { Color: color, Alpha: alpha };
};
