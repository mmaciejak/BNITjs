/*
 * Jenkins lookup3 hashes as used by Blender's procedural textures. Ported from Cycles'
 * intern/cycles/util/hash.h (Blender 5.2).
 * SPDX-FileCopyrightText: 2011-2022 Blender Foundation. SPDX-License-Identifier: Apache-2.0.
 *
 * The TSL functions run on u32 (WGSL) / uint (GLSL ES 3.0), whose arithmetic wraps like C's
 * unsigned ints. Each function is emitted once as a real shader function (Fn with a layout), so
 * the hash inputs are never constant expressions: WGSL rejects u32 overflow in constant evaluation.
 * The plain JS versions compute constants (e.g. Noise's random offsets) on the CPU.
 */
import { Fn, float, floatBitsToUint, uint, vec2, vec3, vec4 } from 'three/tsl';
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
