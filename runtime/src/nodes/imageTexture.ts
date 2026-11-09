/*
 * Image Texture. Follows Cycles' svm_node_tex_image (Blender 5.2) for projections (Flat, Box, Sphere,
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
  exp2,
  float,
  floor,
  int,
  ivec2,
  max,
  mix,
  normalLocal,
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
import { blenderUV, toBlender } from './space.js';

type Vec2Node = Node<'vec2'>;

interface ImageRef {
  texture?: number;
  name?: string;
  colorspace?: string;
  alphaMode?: string;
  /** "rgbe": a float image stored as Radiance RGBE in an 8-bit PNG. */
  encoding?: string;
  /** With "rgbe": added to each decoded rgb value (the exporter's bakes can be negative). */
  offset?: [number, number, number];
}

/**
 * Radiance RGBE texel → linear rgb (alpha 1): (byte + 0.5) · 2^(e − 136), 0 when e = 0, plus
 * the image's offset.
 */
function decodeRGBE(raw: Vec4Node, offset?: [number, number, number]): Vec4Node {
  const e = raw.w.mul(255).round();
  const scale = select(e.equal(0), float(0), exp2(e.sub(136)));
  const rgb = raw.xyz.mul(255).round().add(0.5).mul(scale);
  return vec4(offset ? rgb.add(vec3(...offset)) : rgb, 1);
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
  extension?: string,
  rgbe = false,
  offset?: [number, number, number],
): Vec4Node {
  const { width, height } = source.image as { width: number; height: number };
  const tex = source.clone();
  tex.colorSpace = NoColorSpace; // raw bytes; decoded in the shader
  tex.generateMipmaps = false;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  const mode = extension ?? ctx.prop<string>('extension', 'REPEAT');
  const texel = (ix: Node<'int'>, iy: Node<'int'>): Vec4Node => {
    const x = wrapIndex(mode, ix, width);
    const y = wrapIndex(mode, iy, height);
    // glTF images are stored top-down: Blender row r is image row (height − 1 − r).
    const raw = textureLoad(
      tex,
      ivec2(x.index, int(height - 1).sub(y.index)),
    ) as unknown as Vec4Node;
    const value = rgbe
      ? decodeRGBE(raw, offset)
      : associate
        ? vec4(raw.xyz.mul(raw.w), raw.w)
        : raw;
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

/**
 * The image of an Image or Environment Texture node as a lookup uv → linear (rgb, alpha), sampled
 * like Cycles; null (with a warning) when the image is missing.
 */
export function makeImageLookup(
  ctx: NodeContext,
  extension?: string,
): ((uv: Vec2Node) => Vec4Node) | null {
  const image = ctx.prop<ImageRef | undefined>('image', undefined);
  const source = image?.texture !== undefined ? ctx.texture(image.texture) : undefined;
  if (!source) {
    ctx.warn(image ? `image "${image.name}" is missing` : 'no image');
    return null;
  }
  const colorspace = image?.colorspace ?? 'sRGB';
  const rgbe = image?.encoding === 'rgbe';
  const isData = /^(Non-Color|Raw)/.test(colorspace);
  // Float images hold scene-linear values (Blender converts their color space on load).
  const isLinear = rgbe || colorspace.startsWith('Linear');
  if (!isData && !isLinear && colorspace !== 'sRGB') {
    ctx.warn(`image color space "${colorspace}" is treated as sRGB`);
  }
  const associate =
    !isData &&
    !rgbe &&
    !['CHANNEL_PACKED', 'NONE'].includes(image?.alphaMode ?? 'STRAIGHT') &&
    !ctx.isOutputLinked('Alpha');
  /** One image lookup, decoded to linear like Cycles' svm_image_texture. */
  return (uv: Vec2Node): Vec4Node => {
    const sample = sampleCycles(ctx, source, uv, associate, extension, rgbe, image?.offset);
    const raw: Vec3Node = sample.xyz;
    const color: Vec3Node =
      isData || isLinear
        ? raw
        : vec3(srgbToLinear(raw.x), srgbToLinear(raw.y), srgbToLinear(raw.z));
    return vec4(color, sample.w);
  };
}

export const imageTexture: NodeImpl = (ctx) => {
  const lookup = makeImageLookup(ctx);
  if (!lookup) return { Color: vec3(1, 0, 1), Alpha: float(1) };
  const vector = ctx.isLinked('Vector')
    ? ctx.vec3('Vector')
    : blenderUV(ctx.graph.uvMaps?.activeRender ?? 0);

  const projection = ctx.prop<string>('projection', 'FLAT');
  let result: Vec4Node;
  if (projection === 'BOX') {
    result = boxProjection(vector, ctx.prop<number>('projection_blend', 0), lookup);
  } else {
    const uv =
      projection === 'SPHERE'
        ? mapToSphere(vector.sub(0.5).mul(2))
        : projection === 'TUBE'
          ? mapToTube(vector.sub(0.5).mul(2))
          : vec2(vector.x, vector.y);
    result = lookup(uv);
  }
  return { Color: result.xyz, Alpha: result.w };
};

/**
 * Box projection (Cycles' svm_node_tex_image_box): three planar lookups along the object-space
 * normal's axes, blended by how much the normal faces each axis.
 */
function boxProjection(co: Vec3Node, blend: number, lookup: (uv: Vec2Node) => Vec4Node): Vec4Node {
  const signed = toBlender(normalLocal).normalize().toVar() as Vec3Node;
  const a = abs(signed);
  const n = a.div(a.x.add(a.y).add(a.z)).toVar() as Vec3Node;
  const limit = 0.5 + 0.5 * blend;
  const divisor = Math.max(1e-8, blend);
  const w0 = clamp(
    n
      .div(vec3(n.x, n.y, n.x).add(vec3(n.y, n.z, n.z)))
      .sub(0.5 * (1 - blend))
      .div(divisor),
    0,
    1,
  ).toVar() as Vec3Node;
  const k = 1 - limit;
  const weight = select(
    n.z.lessThan(n.y.add(n.x).mul(k)),
    vec3(w0.x, float(1).sub(w0.x), 0),
    select(
      n.x.lessThan(n.y.add(n.z).mul(k)),
      vec3(0, w0.y, float(1).sub(w0.y)),
      select(
        n.y.lessThan(n.x.add(n.z).mul(k)),
        vec3(float(1).sub(w0.z), 0, w0.z),
        n
          .mul(2 - limit)
          .add(limit - 1)
          .div(divisor),
      ),
    ),
  ).toVar() as Vec3Node;
  const flip = (c: FloatNode, cond: Node<'bool'>) => select(cond, float(1).sub(c), c) as FloatNode;
  const cx = lookup(vec2(flip(co.y, signed.x.lessThan(0)), co.z));
  const cy = lookup(vec2(flip(co.x, signed.y.greaterThan(0)), co.z));
  const cz = lookup(vec2(flip(co.y, signed.z.greaterThan(0)), co.x));
  return cx.mul(weight.x).add(cy.mul(weight.y)).add(cz.mul(weight.z)) as Vec4Node;
}
