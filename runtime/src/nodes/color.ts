/*
 * Color helpers: RGB <-> HSV/HSL and the Mix blend modes.
 *
 * Follows Cycles' intern/cycles/util/color.h (rgb_to_hsv, hsv_to_rgb, rgb_to_hsl, hsl_to_rgb)
 * and intern/cycles/kernel/svm/mix.h (svm_mix_*) in Blender 5.2.
 * SPDX-FileCopyrightText: 2011-2023 Blender Authors. SPDX-License-Identifier: Apache-2.0.
 */
import { abs, clamp, float, floor, max, min, mix, saturate, select, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../graph/convert.js';

export function rgbToHsv(rgb: Vec3Node): Vec3Node {
  const cmax = max(rgb.x, max(rgb.y, rgb.z));
  const cmin = min(rgb.x, min(rgb.y, rgb.z));
  const cdelta = cmax.sub(cmin);
  const s = select(cmax.notEqual(0), cdelta.div(cmax), float(0));
  const c = vec3(cmax).sub(rgb).div(cdelta);
  let h = select(
    rgb.x.equal(cmax),
    c.z.sub(c.y),
    select(rgb.y.equal(cmax), float(2).add(c.x).sub(c.z), float(4).add(c.y).sub(c.x)),
  ).div(6);
  h = select(h.lessThan(0), h.add(1), h);
  return vec3(select(s.notEqual(0), h, float(0)), s, cmax);
}

export function hsvToRgb(hsv: Vec3Node): Vec3Node {
  const s = hsv.y;
  const v = hsv.z;
  const h = select(hsv.x.equal(1), float(0), hsv.x).mul(6);
  const i = floor(h);
  const f = h.sub(i);
  const p = v.mul(float(1).sub(s));
  const q = v.mul(float(1).sub(s.mul(f)));
  const t = v.mul(float(1).sub(s.mul(float(1).sub(f))));
  const rgb = select(
    i.equal(0),
    vec3(v, t, p),
    select(
      i.equal(1),
      vec3(q, v, p),
      select(
        i.equal(2),
        vec3(p, v, t),
        select(i.equal(3), vec3(p, q, v), select(i.equal(4), vec3(t, p, v), vec3(v, p, q))),
      ),
    ),
  );
  return select(s.notEqual(0), rgb, vec3(v));
}

export function rgbToHsl(rgb: Vec3Node): Vec3Node {
  const cmax = max(rgb.x, max(rgb.y, rgb.z));
  const cmin = min(rgb.x, min(rgb.y, rgb.z));
  const l = min(float(1), cmax.add(cmin).div(2));
  const d = cmax.sub(cmin);
  const s = select(l.greaterThan(0.5), d.div(float(2).sub(cmax).sub(cmin)), d.div(cmax.add(cmin)));
  const h = select(
    cmax.equal(rgb.x),
    rgb.y
      .sub(rgb.z)
      .div(d)
      .add(select(rgb.y.lessThan(rgb.z), float(6), float(0))),
    select(cmax.equal(rgb.y), rgb.z.sub(rgb.x).div(d).add(2), rgb.x.sub(rgb.y).div(d).add(4)),
  );
  const same = cmax.equal(cmin);
  return vec3(select(same, float(0), h.div(6)), select(same, float(0), s), l);
}

export function hslToRgb(hsl: Vec3Node): Vec3Node {
  const h6 = hsl.x.mul(6);
  const nr = clamp(abs(h6.sub(3)).sub(1), 0, 1);
  const ng = clamp(float(2).sub(abs(h6.sub(2))), 0, 1);
  const nb = clamp(float(2).sub(abs(h6.sub(4))), 0, 1);
  const chroma = float(1)
    .sub(abs(hsl.z.mul(2).sub(1)))
    .mul(hsl.y);
  return vec3(nr, ng, nb).sub(0.5).mul(chroma).add(hsl.z);
}

type Blend = (t: FloatNode, a: Vec3Node, b: Vec3Node) => Vec3Node;
const ONE = vec3(1);

/** Apply a per-component function to the three channels. */
const perChannel = (f: (a: FloatNode, b: FloatNode) => FloatNode) => (a: Vec3Node, b: Vec3Node) =>
  vec3(f(a.x, b.x), f(a.y, b.y), f(a.z, b.z));

export const BLEND_MODES: Record<string, Blend> = {
  MIX: (t, a, b) => mix(a, b, t),
  ADD: (t, a, b) => mix(a, a.add(b), t),
  MULTIPLY: (t, a, b) => mix(a, a.mul(b), t),
  SCREEN: (t, a, b) => ONE.sub(vec3(float(1).sub(t)).add(ONE.sub(b).mul(t)).mul(ONE.sub(a))),
  OVERLAY: (t, a, b) => {
    const tm = float(1).sub(t);
    return perChannel((x, y) =>
      select(
        x.lessThan(0.5),
        x.mul(tm.add(t.mul(2).mul(y))),
        float(1).sub(tm.add(t.mul(2).mul(float(1).sub(y))).mul(float(1).sub(x))),
      ),
    )(a, b);
  },
  SUBTRACT: (t, a, b) => mix(a, a.sub(b), t),
  DIVIDE: (t, a, b) => {
    const tm = float(1).sub(t);
    return perChannel((x, y) => select(y.notEqual(0), tm.mul(x).add(t.mul(x).div(y)), x))(a, b);
  },
  DIFFERENCE: (t, a, b) => mix(a, abs(a.sub(b)), t),
  EXCLUSION: (t, a, b) => max(mix(a, a.add(b).sub(a.mul(b).mul(2)), t), vec3(0)),
  DARKEN: (t, a, b) => mix(a, min(a, b), t),
  LIGHTEN: (t, a, b) => mix(a, max(a, b), t),
  DODGE: (t, a, b) =>
    perChannel((x, y) => {
      const tmp = float(1).sub(t.mul(y));
      const q = x.div(tmp);
      return select(
        x.notEqual(0),
        select(tmp.lessThanEqual(0), float(1), select(q.greaterThan(1), float(1), q)),
        x,
      );
    })(a, b),
  BURN: (t, a, b) =>
    perChannel((x, y) => {
      const tmp = float(1).sub(t).add(t.mul(y));
      const q = float(1).sub(float(1).sub(x).div(tmp));
      return select(tmp.lessThanEqual(0), float(0), saturate(q));
    })(a, b),
  HUE: (t, a, b) => {
    const hsv2 = rgbToHsv(b);
    const hsv = rgbToHsv(a);
    return select(hsv2.y.notEqual(0), mix(a, hsvToRgb(vec3(hsv2.x, hsv.y, hsv.z)), t), a);
  },
  SATURATION: (t, a, b) => {
    const hsv = rgbToHsv(a);
    const hsv2 = rgbToHsv(b);
    const sat = float(1).sub(t).mul(hsv.y).add(t.mul(hsv2.y));
    return select(hsv.y.notEqual(0), hsvToRgb(vec3(hsv.x, sat, hsv.z)), a);
  },
  VALUE: (t, a, b) => {
    const hsv = rgbToHsv(a);
    const hsv2 = rgbToHsv(b);
    return hsvToRgb(vec3(hsv.x, hsv.y, float(1).sub(t).mul(hsv.z).add(t.mul(hsv2.z))));
  },
  COLOR: (t, a, b) => {
    const hsv2 = rgbToHsv(b);
    const hsv = rgbToHsv(a);
    return select(hsv2.y.notEqual(0), mix(a, hsvToRgb(vec3(hsv2.x, hsv2.y, hsv.z)), t), a);
  },
  SOFT_LIGHT: (t, a, b) => {
    const scr = ONE.sub(ONE.sub(b).mul(ONE.sub(a)));
    return a.mul(float(1).sub(t)).add(ONE.sub(a).mul(b).mul(a).add(a.mul(scr)).mul(t));
  },
  LINEAR_LIGHT: (t, a, b) => a.add(b.mul(2).sub(1).mul(t)),
};

export function blend(mode: string, t: FloatNode, a: Vec3Node, b: Vec3Node): Vec3Node | null {
  const f = BLEND_MODES[mode];
  return f ? f(t, a, b) : null;
}
