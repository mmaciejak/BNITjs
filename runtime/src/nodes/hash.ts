/*
 * Jenkins lookup3 hashes as used by Blender's procedural textures. Ported from Cycles'
 * intern/cycles/util/hash.h (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2022 Blender Foundation. SPDX-License-Identifier: Apache-2.0.
 *
 * The TSL functions run on u32 (WGSL) / uint (GLSL ES 3.0), whose arithmetic wraps like C's
 * unsigned ints. Each function is emitted once as a real shader function (Fn with a layout), so
 * the hash inputs are never constant expressions: WGSL rejects u32 overflow in constant evaluation.
 * The plain JS versions compute constants (e.g. Noise's random offsets) on the CPU.
 *
 * The PCG integer hashes (hash_pcg*d_i, used by Voronoi since Blender 5) are ported from
 * source/blender/gpu/shaders/common/gpu_shader_common_hash.glsl (Blender 5.2), which matches
 * Cycles. They run on i32, whose multiplication also wraps.
 */
import {
  Fn,
  float,
  floatBitsToUint,
  int,
  ivec2,
  ivec3,
  ivec4,
  uint,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

type U = Node<'uint'>;

const INIT = (n: number) => (0xdeadbeef + (n << 2) + 13) >>> 0;

// ---------------------------------------------------------------------------------------- TSL

const rot = (x: U, k: number): U => x.shiftLeft(uint(k)).bitOr(x.shiftRight(uint(32 - k))) as U;

/** lookup3 final(a, b, c); returns c. */
function finalC(a0: U, b0: U, c0: U): U {
  let a = a0;
  let b = b0;
  let c = c0;
  c = c.bitXor(b).sub(rot(b, 14)).toVar() as U;
  a = a.bitXor(c).sub(rot(c, 11)).toVar() as U;
  b = b.bitXor(a).sub(rot(a, 25)).toVar() as U;
  c = c.bitXor(b).sub(rot(b, 16)).toVar() as U;
  a = a.bitXor(c).sub(rot(c, 4)).toVar() as U;
  b = b.bitXor(a).sub(rot(a, 14)).toVar() as U;
  return c.bitXor(b).sub(rot(b, 24)) as U;
}

/** lookup3 mix(a, b, c). */
function mixABC(a0: U, b0: U, c0: U): [U, U, U] {
  let a = a0;
  let b = b0;
  let c = c0;
  a = a.sub(c).bitXor(rot(c, 4)).toVar() as U;
  c = c.add(b).toVar() as U;
  b = b.sub(a).bitXor(rot(a, 6)).toVar() as U;
  a = a.add(c).toVar() as U;
  c = c.sub(b).bitXor(rot(b, 8)).toVar() as U;
  b = b.add(a).toVar() as U;
  a = a.sub(c).bitXor(rot(c, 16)).toVar() as U;
  c = c.add(b).toVar() as U;
  b = b.sub(a).bitXor(rot(a, 19)).toVar() as U;
  a = a.add(c).toVar() as U;
  c = c.sub(b).bitXor(rot(b, 4)).toVar() as U;
  b = b.add(a).toVar() as U;
  return [a, b, c];
}

export const hashUint = Fn(
  ([kx]: [U]) => {
    const init = uint(INIT(1)).toVar() as U;
    return finalC(init.add(kx) as U, init, init);
  },
  { kx: 'uint', return: 'uint' },
) as unknown as (kx: U) => U;

export const hashUint2 = Fn(
  ([kx, ky]: [U, U]) => {
    const init = uint(INIT(2)).toVar() as U;
    return finalC(init.add(kx) as U, init.add(ky) as U, init);
  },
  { kx: 'uint', ky: 'uint', return: 'uint' },
) as unknown as (kx: U, ky: U) => U;

export const hashUint3 = Fn(
  ([kx, ky, kz]: [U, U, U]) => {
    const init = uint(INIT(3)).toVar() as U;
    return finalC(init.add(kx) as U, init.add(ky) as U, init.add(kz) as U);
  },
  { kx: 'uint', ky: 'uint', kz: 'uint', return: 'uint' },
) as unknown as (kx: U, ky: U, kz: U) => U;

export const hashUint4 = Fn(
  ([kx, ky, kz, kw]: [U, U, U, U]) => {
    const init = uint(INIT(4)).toVar() as U;
    const [a, b, c] = mixABC(init.add(kx) as U, init.add(ky) as U, init.add(kz) as U);
    return finalC(a.add(kw) as U, b, c);
  },
  { kx: 'uint', ky: 'uint', kz: 'uint', kw: 'uint', return: 'uint' },
) as unknown as (kx: U, ky: U, kz: U, kw: U) => U;

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** hash_uint_to_float: k / 0xFFFFFFFF (which rounds to 2^32 as a float, as in C). */
const toUnit = (k: U): F => k.toFloat().div(float(4294967296)) as F;

const bits = (x: F): U => floatBitsToUint(x) as unknown as U;

export const hashFloat = Fn(([k]: [F]) => toUnit(hashUint(bits(k))), {
  k: 'float',
  return: 'float',
}) as unknown as (k: F) => F;

export const hashFloat2 = Fn(([k]: [V2]) => toUnit(hashUint2(bits(k.x), bits(k.y))), {
  k: 'vec2',
  return: 'float',
}) as unknown as (k: V2) => F;

export const hashFloat3 = Fn(([k]: [V3]) => toUnit(hashUint3(bits(k.x), bits(k.y), bits(k.z))), {
  k: 'vec3',
  return: 'float',
}) as unknown as (k: V3) => F;

export const hashFloat4 = Fn(
  ([k]: [V4]) => toUnit(hashUint4(bits(k.x), bits(k.y), bits(k.z), bits(k.w))),
  { k: 'vec4', return: 'float' },
) as unknown as (k: V4) => F;

export const hashFloatToVec3 = (k: F): V3 =>
  vec3(hashFloat(k), hashFloat2(vec2(k, 1) as V2), hashFloat2(vec2(k, 2) as V2)) as V3;

export const hashFloat2ToVec3 = (k: V2): V3 =>
  vec3(hashFloat2(k), hashFloat3(vec3(k, 1) as V3), hashFloat3(vec3(k, 2) as V3)) as V3;

export const hashFloat3ToVec3 = (k: V3): V3 =>
  vec3(hashFloat3(k), hashFloat4(vec4(k, 1) as V4), hashFloat4(vec4(k, 2) as V4)) as V3;

export const hashFloat4ToVec3 = (k: V4): V3 =>
  vec3(hashFloat4(k), hashFloat4(k.zxwy as V4), hashFloat4(k.wzyx as V4)) as V3;

/** hash_vec2_to_vec2 .. hash_vec4_to_vec4 (float cell hashes, Voronoi before Blender 5). */
export const hashVec2ToVec2 = (k: V2): V2 =>
  vec2(hashFloat2(k), hashFloat3(vec3(k, 1) as V3)) as V2;
export const hashVec4ToVec4 = (k: V4): V4 =>
  vec4(
    hashFloat4(k),
    hashFloat4(k.wxyz as V4),
    hashFloat4(k.zwxy as V4),
    hashFloat4(k.yzwx as V4),
  ) as V4;

// PCG integer hashes ---------------------------------------------------------------------------

type I = Node<'int'>;
type IV2 = Node<'ivec2'>;
type IV3 = Node<'ivec3'>;
type IV4 = Node<'ivec4'>;

const PCG_MUL = 1664525;
const PCG_ADD = 1013904223;
const lcg = (x: I): I => x.mul(int(PCG_MUL)).add(int(PCG_ADD)).toVar() as I;
const xorShift = (x: I): I => x.bitXor(x.shiftRight(int(16))).toVar() as I;
const v = (x: I): I => x.toVar() as I;

/** hash_pcg2d_i. */
export const hashPcg2 = Fn(
  ([k]: [IV2]) => {
    let x = lcg(k.x as I);
    let y = lcg(k.y as I);
    x = v(x.add(y.mul(int(PCG_MUL))));
    y = v(y.add(x.mul(int(PCG_MUL))));
    x = xorShift(x);
    y = xorShift(y);
    x = v(x.add(y.mul(int(PCG_MUL))));
    y = v(y.add(x.mul(int(PCG_MUL))));
    return ivec2(x, y);
  },
  { k: 'ivec2', return: 'ivec2' },
) as unknown as (k: IV2) => IV2;

/** hash_pcg3d_i. */
export const hashPcg3 = Fn(
  ([k]: [IV3]) => {
    let x = lcg(k.x as I);
    let y = lcg(k.y as I);
    let z = lcg(k.z as I);
    x = v(x.add(y.mul(z)));
    y = v(y.add(z.mul(x)));
    z = v(z.add(x.mul(y)));
    x = xorShift(x);
    y = xorShift(y);
    z = xorShift(z);
    x = v(x.add(y.mul(z)));
    y = v(y.add(z.mul(x)));
    z = v(z.add(x.mul(y)));
    return ivec3(x, y, z);
  },
  { k: 'ivec3', return: 'ivec3' },
) as unknown as (k: IV3) => IV3;

/** hash_pcg4d_i. */
export const hashPcg4 = Fn(
  ([k]: [IV4]) => {
    let x = lcg(k.x as I);
    let y = lcg(k.y as I);
    let z = lcg(k.z as I);
    let w = lcg(k.w as I);
    x = v(x.add(y.mul(w)));
    y = v(y.add(z.mul(x)));
    z = v(z.add(x.mul(y)));
    w = v(w.add(y.mul(z)));
    x = xorShift(x);
    y = xorShift(y);
    z = xorShift(z);
    w = xorShift(w);
    x = v(x.add(y.mul(w)));
    y = v(y.add(z.mul(x)));
    z = v(z.add(x.mul(y)));
    w = v(w.add(y.mul(z)));
    return ivec4(x, y, z, w);
  },
  { k: 'ivec4', return: 'ivec4' },
) as unknown as (k: IV4) => IV4;

/** (h & 0x7fffffff) / float(0x7fffffff), with float(0x7fffffff) = 2^31 as in C. */
const INV_31 = Math.fround(1 / 2147483648);
const positive = <T>(h: T): T => (h as unknown as I).bitAnd(int(0x7fffffff)) as unknown as T;

export const hashInt2ToVec2 = (k: IV2): V2 => vec2(positive(hashPcg2(k))).mul(INV_31) as V2;
export const hashInt3ToVec3 = (k: IV3): V3 => vec3(positive(hashPcg3(k))).mul(INV_31) as V3;
export const hashInt4ToVec4 = (k: IV4): V4 => vec4(positive(hashPcg4(k))).mul(INV_31) as V4;
export const hashInt2ToVec3 = (k: IV2): V3 => hashInt3ToVec3(ivec3(k, 0) as IV3);
export const hashInt4ToVec3 = (k: IV4): V3 => hashInt4ToVec4(k).xyz as V3;

// ----------------------------------------------------------------------------------------- JS

const rotJS = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

function finalJS(a: number, b: number, c: number): number {
  c = ((c ^ b) - rotJS(b, 14)) >>> 0;
  a = ((a ^ c) - rotJS(c, 11)) >>> 0;
  b = ((b ^ a) - rotJS(a, 25)) >>> 0;
  c = ((c ^ b) - rotJS(b, 16)) >>> 0;
  a = ((a ^ c) - rotJS(c, 4)) >>> 0;
  b = ((b ^ a) - rotJS(a, 14)) >>> 0;
  return ((c ^ b) - rotJS(b, 24)) >>> 0;
}

const F32 = new Float32Array(1);
const U32 = new Uint32Array(F32.buffer);
const floatBits = (x: number) => {
  F32[0] = x;
  return U32[0]!;
};

export function hashUint2JS(kx: number, ky: number): number {
  const init = INIT(2);
  return finalJS((init + kx) >>> 0, (init + ky) >>> 0, init);
}

export function hashUintJS(kx: number): number {
  const init = INIT(1);
  return finalJS((init + kx) >>> 0, init, init);
}

/** hash_uint_to_float, rounded to float32 like the C division. */
const toUnitJS = (k: number) => Math.fround(Math.fround(k) / 4294967296);

export const hashFloatJS = (k: number) => toUnitJS(hashUintJS(floatBits(k)));
export const hashFloat2JS = (x: number, y: number) =>
  toUnitJS(hashUint2JS(floatBits(x), floatBits(y)));
