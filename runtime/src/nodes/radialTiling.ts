/*
 * Radial Tiling (Blender 5.x). Ported from Blender 5.2's gpu_shader_material_radial_tiling.glsl and
 * gpu_shader_material_radial_tiling_shared.glsl (the code Cycles' SVM shares), GPU path: every
 * output is always computed, and the full-roundness irregular case that only geometry nodes use
 * is left out.
 *
 * Each case of calculate_out_variables is a function returning
 * (l_angle_bisector, r_gon_parameter, max_unit_parameter, x_axis_A_angle_bisector); the case that
 * applies is picked with select() instead of branching. Names follow Blender's: "A" is the angle
 * between, "R" the ratio of, "l_" a length.
 * SPDX-FileCopyrightText: 2025 Blender Authors. SPDX-License-Identifier: GPL-2.0-or-later.
 */
import {
  abs,
  atan,
  clamp,
  cos,
  float,
  floor,
  fract,
  max,
  mix,
  select,
  sin,
  sqrt,
  tan,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { FloatNode } from '../graph/convert.js';
import type { NodeImpl } from '../graph/evaluate.js';

type Vec2Node = Node<'vec2'>;
type Vec4Node = Node<'vec4'>;
type BoolNode = Node<'bool'>;

const PI = Math.PI;
const TAU = 2 * Math.PI;

const sqr = (v: FloatNode) => v.mul(v) as FloatNode;
/** GLSL's mix(a, b, t) (function form: the method form reorders arguments). */
const lerp = (a: FloatNode, b: FloatNode, t: FloatNode) => mix(a, b, t) as FloatNode;
/** v, negated when `negative` holds. */
const signed = (v: FloatNode, negative: BoolNode) => select(negative, v.negate(), v) as FloatNode;
const pick = (c: BoolNode, a: Vec4Node, b: Vec4Node) => select(c, a, b) as Vec4Node;

/** Angles shared by every case. */
function segments(sides: FloatNode, coord: Vec2Node) {
  const xAxisACoord = atan(coord.y, coord.x).add(
    select(coord.y.lessThan(0), float(TAU), float(0)),
  ) as FloatNode;
  const sab = float(PI).div(sides) as FloatNode; // segment_divider_A_angle_bisector
  const snext = sab.mul(2) as FloatNode; // segment_divider_A_next_segment_divider
  const segmentId = floor(xAxisACoord.div(snext)) as FloatNode;
  const sdc = xAxisACoord.sub(segmentId.mul(snext)) as FloatNode; // segment_divider_A_coord
  const rotation = segmentId.mul(snext) as FloatNode; // + the angle bisector of the segment
  return { xAxisACoord, sab, snext, segmentId, sdc, rotation };
}

type Seg = ReturnType<typeof segments>;

/** A straight edge of the regular part: shared by the sharp and rounded cases. */
function straightEdge(
  s: Seg,
  lCoord: FloatNode,
  normalizer: (l: FloatNode) => FloatNode,
  normalize: boolean,
  maxUnit: FloatNode,
): Vec4Node {
  const l = lCoord.mul(cos(s.sab.sub(s.sdc))) as FloatNode;
  let rg = signed(l.mul(tan(abs(s.sab.sub(s.sdc)))) as FloatNode, s.sdc.lessThan(s.sab));
  if (normalize) rg = rg.div(normalizer(l)) as FloatNode;
  return vec4(l, rg, maxUnit, s.rotation.add(s.sab));
}

/** The rounded corner of a regular segment (bevel between bevel_start and the divider). */
function roundedCorner(
  s: Seg,
  lCoord: FloatNode,
  r: FloatNode,
  sbs: FloatNode,
  normalize: boolean,
): Vec4Node {
  const bsab = s.sab.sub(sbs) as FloatNode; // bevel_start_A_angle_bisector
  const nsd = s.sdc.sub(select(s.sdc.greaterThan(s.sab), s.snext, float(0))) as FloatNode; // nearest_segment_divider_SA_coord
  const lcc = float(1).sub(r).div(cos(s.sab)) as FloatNode; // l_circle_center
  const lcr = cos(nsd)
    .mul(lcc)
    .add(
      sqrt(
        sqr(cos(nsd).mul(lcc) as FloatNode)
          .add(sqr(r))
          .sub(sqr(lcc)),
      ),
    ) as FloatNode;
  const l = lCoord.div(lcr) as FloatNode;
  const ssb = float(1).sub(r).mul(sbs) as FloatNode; // spline_start_A_bevel_start
  const cab = sbs.sub(abs(nsd)) as FloatNode; // coord_A_bevel_start
  const base = lCoord.mul(sin(bsab));
  const lcos = lCoord.mul(cos(bsab)) as FloatNode;
  const inSpline = base
    .add(lcos.mul(cab))
    .add(float(0.5).mul(float(1).sub(lcos)).mul(sqr(cab)).div(ssb));
  const pastSpline = base.add(ssb.mul(lcos.mul(0.5).sub(0.5))).add(cab);
  let rg = signed(
    select(cab.lessThan(ssb), inSpline, pastSpline) as FloatNode,
    s.sdc.lessThan(s.sab),
  );
  if (normalize) {
    const byBisector = l
      .mul(tan(bsab))
      .add(ssb.mul(l.mul(0.5).add(0.5)))
      .add(r.mul(sbs));
    const byCoord = base.add(ssb.mul(lcos.mul(0.5).add(0.5))).add(r.mul(sbs));
    rg = rg.div(
      lerp(byBisector as FloatNode, byCoord as FloatNode, cab.div(sbs) as FloatNode),
    ) as FloatNode;
  }
  const maxUnit = tan(bsab).add(ssb).add(r.mul(sbs)) as FloatNode;
  return vec4(l, rg, maxUnit, s.rotation.add(s.sab));
}

/** Integer number of sides (calculate_out_variables, fractf(r_gon_sides) == 0). */
function regular(
  sides: FloatNode,
  r: FloatNode,
  coord: Vec2Node,
  lCoord: FloatNode,
  normalize: boolean,
) {
  const s = segments(sides, coord);
  const notTwo = sides.notEqual(2);
  // Roundness 0: a sharp polygon.
  const sharp = (() => {
    const l = lCoord.mul(cos(s.sab.sub(s.sdc))) as FloatNode;
    let rg = signed(l.mul(tan(abs(s.sab.sub(s.sdc)))) as FloatNode, s.sdc.lessThan(s.sab));
    if (normalize) rg = select(notTwo, rg.div(l.mul(tan(s.sab))), rg) as FloatNode;
    const maxUnit = select(notTwo, tan(s.sab), float(0)) as FloatNode;
    return vec4(l, rg, maxUnit, s.rotation.add(s.sab)) as Vec4Node;
  })();
  // Roundness 1: a circle.
  const circle = (() => {
    let rg = signed(abs(s.sab.sub(s.sdc)) as FloatNode, s.sdc.lessThan(s.sab));
    if (normalize) rg = rg.div(s.sab) as FloatNode;
    return vec4(lCoord, rg, s.sab, s.rotation.add(s.sab)) as Vec4Node;
  })();
  // In between: straight edges and rounded corners.
  const sbs = s.sab.sub(atan(float(1).sub(r).mul(tan(s.sab)))) as FloatNode; // bevel_start
  const bsab = s.sab.sub(sbs) as FloatNode;
  const ssb = float(1).sub(r).mul(sbs) as FloatNode;
  const maxUnit = tan(bsab).add(ssb).add(r.mul(sbs)) as FloatNode;
  const edge = straightEdge(
    s,
    lCoord,
    (l) =>
      l
        .mul(tan(bsab))
        .add(ssb.mul(l.mul(0.5).add(0.5)))
        .add(r.mul(sbs)) as FloatNode,
    normalize,
    maxUnit,
  );
  const corner = roundedCorner(s, lCoord, r, sbs, normalize);
  const inCorner = s.sdc.greaterThanEqual(s.snext.sub(sbs)).or(s.sdc.lessThan(sbs));
  const rounded = pick(inCorner, corner, edge);
  return pick(r.equal(0), sharp, pick(r.equal(1), circle, rounded));
}

/** Fractional sides, roundness 0: the last segment is narrower. */
function irregularSharp(sides: FloatNode, coord: Vec2Node, lCoord: FloatNode, normalize: boolean) {
  const s = segments(sides, coord);
  const lab = float(PI).sub(floor(sides).mul(s.sab)) as FloatNode; // last_angle_bisector_A_x_axis
  const lsd = lab.mul(2) as FloatNode; // last_segment_divider_A_x_axis
  const regularPart = straightEdge(
    s,
    lCoord,
    (l) => l.mul(tan(s.sab)) as FloatNode,
    normalize,
    tan(s.sab) as FloatNode,
  );
  const ratio = cos(s.sab).div(cos(lab)) as FloatNode; // l_angle_bisector_R_l_last_angle_bisector
  const lla = lCoord.mul(cos(lab.sub(s.sdc))) as FloatNode; // l_last_angle_bisector
  let rg = signed(ratio.mul(lla).mul(tan(abs(lab.sub(s.sdc)))) as FloatNode, s.sdc.lessThan(lab));
  if (normalize) rg = rg.div(ratio.mul(lla).mul(tan(lab))) as FloatNode;
  const lastPart = vec4(ratio.mul(lla), rg, tan(lab), s.rotation.add(lab)) as Vec4Node;
  return pick(s.xAxisACoord.lessThan(float(TAU).sub(lsd)), regularPart, lastPart);
}

/** Fractional sides with roundness (calculate_out_variables_irregular_circular). */
function irregularRounded(
  sides: FloatNode,
  r: FloatNode,
  coord: Vec2Node,
  lCoord: FloatNode,
  normalize: boolean,
) {
  const s = segments(sides, coord);
  const { xAxisACoord: xa, sab, sdc } = s;
  const sbs = sab.sub(atan(float(1).sub(r).mul(tan(sab)))) as FloatNode;
  const lab = float(PI).sub(floor(sides).mul(sab)) as FloatNode;
  const lsd = lab.mul(2) as FloatNode;
  const ilbs = lab.sub(atan(float(1).sub(r).mul(tan(lab)))) as FloatNode; // inner_last_bevel_start_A_x_axis
  const llcr = r.mul(tan(lab)).div(tan(sab.add(lab).mul(0.5))) as FloatNode; // l_last_circle_radius
  const k = cos(lab.sub(ilbs));
  const center = vec2(
    cos(ilbs)
      .div(k)
      .sub(llcr.mul(cos(lab))),
    llcr.mul(sin(lab)).sub(sin(ilbs).div(k)),
  ) as Vec2Node; // last_circle_center
  const olbs = center.add(vec2(cos(sab), sin(sab)).mul(llcr)) as Vec2Node; // outer_last_bevel_start
  const xolbs = atan(olbs.y.div(olbs.x)) as FloatNode; // x_axis_A_outer_last_bevel_start
  const olbsab = sab.sub(xolbs) as FloatNode; // outer_last_bevel_start_A_angle_bisector
  const bsab = sab.sub(sbs) as FloatNode;
  const ssb = float(1).sub(r).mul(sbs) as FloatNode;
  const maxUnitRegular = tan(bsab).add(ssb).add(r.mul(sbs)) as FloatNode;
  const end = float(TAU).sub(lsd); // where the last segment starts

  // The regular segments, away from the last one's bevels.
  const nearLast = xa.greaterThanEqual(end.sub(sab)).or(xa.lessThan(sab));
  const effective = float(1).sub(tan(sab.sub(xolbs)).div(tan(sab))) as FloatNode; // effective_roundness
  const ssOuter = float(1).sub(effective).mul(xolbs) as FloatNode; // spline_start_outer_last_bevel_start
  const edge = straightEdge(
    s,
    lCoord,
    (l) =>
      select(
        nearLast,
        l
          .mul(tan(olbsab))
          .add(ssOuter.mul(l.mul(0.5).add(0.5)))
          .add(effective.mul(xolbs)),
        l
          .mul(tan(bsab))
          .add(ssb.mul(l.mul(0.5).add(0.5)))
          .add(r.mul(sbs)),
      ) as FloatNode,
    normalize,
    maxUnitRegular,
  );
  const corner = roundedCorner(s, lCoord, r, sbs, normalize);
  const onEdge = sdc
    .greaterThanEqual(sbs)
    .and(sdc.lessThan(s.snext.sub(sbs)))
    .or(xa.greaterThanEqual(end.sub(sbs)))
    .or(xa.lessThan(sbs));
  const regularPart = pick(onEdge, edge, corner);

  // The last, narrower segment.
  const ilbsla = lab.sub(ilbs) as FloatNode; // inner_last_bevel_start_A_last_angle_bisector
  const ratio = cos(sab).div(cos(lab)) as FloatNode;
  const ssLast = float(1).sub(r).mul(ilbs) as FloatNode;
  const maxUnitLast = tan(ilbsla).add(
    ratio.mul(ssLast.mul(float(0.5).div(ratio).add(0.5)).add(r.mul(ilbs))),
  ) as FloatNode;
  // Its straight edge.
  const lastEdge = (() => {
    const lla = lCoord.mul(cos(lab.sub(sdc))) as FloatNode;
    let rg = signed(ratio.mul(lla).mul(tan(abs(lab.sub(sdc)))) as FloatNode, sdc.lessThan(lab));
    if (normalize) {
      rg = rg.div(
        ratio.mul(
          lla
            .mul(tan(ilbsla))
            .add(ssLast.mul(lla.mul(0.5).add(0.5)))
            .add(r.mul(ilbs)),
        ),
      ) as FloatNode;
    }
    return vec4(ratio.mul(lla), rg, maxUnitLast, s.rotation.add(lab)) as Vec4Node;
  })();
  // Its bevels: the corner circle of the last segment.
  const lastBevels = (() => {
    const flip = xa.greaterThanEqual(end.sub(xolbs)).and(xa.lessThan(float(TAU).sub(lab)));
    const angle = atan(coord.y, coord.x) as FloatNode;
    const nsm = select(flip, angle.add(lsd).negate(), angle) as FloatNode; // nearest_segment_divider_MSA_coord
    const proj = sin(nsm).mul(center.y).add(cos(nsm).mul(center.x)) as FloatNode;
    const lcr = proj.add(
      sqrt(
        sqr(proj)
          .add(sqr(llcr))
          .sub(sqr(center.x as FloatNode))
          .sub(sqr(center.y as FloatNode)),
      ),
    ) as FloatNode; // l_coord_R_l_last_angle_bisector
    const lla = lCoord.div(lcr) as FloatNode;
    const l = ratio.mul(lla) as FloatNode;
    // nsm < 0: the inner bevel of the last segment.
    const inner = (() => {
      const cab = ilbs.sub(abs(nsm)) as FloatNode;
      const lcos = lCoord.mul(cos(ilbsla)) as FloatNode;
      const base = lCoord.mul(sin(ilbsla));
      const inSpline = base
        .add(lcos.mul(cab))
        .add(float(0.5).mul(float(1).sub(lcos)).mul(sqr(cab)).div(ssLast));
      const pastSpline = base.add(ssLast.mul(lcos.mul(0.5).sub(0.5))).add(cab);
      let rg = signed(
        ratio.mul(select(cab.lessThan(ssLast), inSpline, pastSpline)) as FloatNode,
        sdc.lessThan(lab),
      );
      if (normalize) {
        const byBisector = lla
          .mul(tan(ilbsla))
          .add(ssLast.mul(lla.mul(0.5).add(0.5)))
          .add(r.mul(ilbs));
        const byCoord = base.add(ssLast.mul(lcos.mul(0.5).add(0.5))).add(r.mul(ilbs));
        rg = rg.div(
          ratio.mul(
            lerp(byBisector as FloatNode, byCoord as FloatNode, cab.div(ilbs) as FloatNode),
          ),
        ) as FloatNode;
      }
      return vec4(l, rg, maxUnitLast, s.rotation.add(lab)) as Vec4Node;
    })();
    // Otherwise: the outer bevel, towards the neighbouring regular segment.
    const outer = (() => {
      const cab = xolbs.sub(abs(nsm)) as FloatNode;
      const lcos = lCoord.mul(cos(olbsab)) as FloatNode;
      const base = lCoord.mul(sin(olbsab));
      const inSpline = base
        .add(lcos.mul(cab))
        .add(float(0.5).mul(float(1).sub(lcos)).mul(sqr(cab)).div(ssOuter));
      const pastSpline = base.add(ssOuter.mul(lcos.mul(0.5).sub(0.5))).add(cab);
      let rg = signed(
        select(cab.lessThan(ssOuter), inSpline, pastSpline) as FloatNode,
        sdc.lessThan(sab),
      );
      if (normalize) {
        const byBisector = l
          .mul(tan(olbsab))
          .add(ssOuter.mul(l.mul(0.5).add(0.5)))
          .add(effective.mul(xolbs));
        const byCoord = base.add(ssOuter.mul(lcos.mul(0.5).add(0.5))).add(effective.mul(xolbs));
        rg = rg.div(
          lerp(byBisector as FloatNode, byCoord as FloatNode, cab.div(xolbs) as FloatNode),
        ) as FloatNode;
      }
      return vec4(l, rg, maxUnitRegular, s.rotation.add(sab)) as Vec4Node;
    })();
    return pick(nsm.lessThan(0), inner, outer);
  })();
  const onLastEdge = xa.greaterThanEqual(end.add(ilbs)).and(xa.lessThan(float(TAU).sub(ilbs)));
  const lastPart = pick(onLastEdge, lastEdge, lastBevels);

  const inRegular = xa.greaterThanEqual(xolbs).and(xa.lessThan(end.sub(xolbs)));
  return pick(inRegular, regularPart, lastPart);
}

/** calculate_out_variables. */
function outVariables(
  sides: FloatNode,
  r: FloatNode,
  coord: Vec2Node,
  normalize: boolean,
): Vec4Node {
  const lCoord = sqrt(sqr(coord.x as FloatNode).add(sqr(coord.y as FloatNode))) as FloatNode;
  const isRegular = fract(sides).equal(0);
  const v = pick(
    isRegular,
    regular(sides, r, coord, lCoord, normalize),
    pick(
      r.equal(0),
      irregularSharp(sides, coord, lCoord, normalize),
      irregularRounded(sides, r, coord, lCoord, normalize),
    ),
  ).toVar() as Vec4Node;
  const atOrigin = coord.x.equal(0).and(coord.y.equal(0));
  const rg = select(atOrigin, float(0), v.y) as FloatNode;
  return normalize
    ? (vec4(v.x, rg.mul(0.5).add(0.5), v.z, v.w) as Vec4Node)
    : (vec4(v.x.sub(1), rg, v.z, v.w) as Vec4Node);
}

export const radialTiling: NodeImpl = (ctx) => {
  const coord = ctx.vec3('Vector', [0, 0, 0]).xy as Vec2Node;
  const sides = max(ctx.float('Sides', 5), 2) as FloatNode;
  const roundness = clamp(ctx.float('Roundness', 0), 0, 1) as FloatNode;
  const normalize = ctx.prop<boolean>('normalize', false);
  const out = outVariables(sides, roundness, coord, normalize);
  const segmentId = floor(
    sides.mul(
      atan(coord.y, coord.x)
        .div(TAU)
        .add(select(coord.y.lessThan(0), float(1), float(0))),
    ),
  );
  return {
    'Segment Coordinates': vec3(out.y, out.x, 0),
    'Segment ID': segmentId,
    'Segment Width': out.z,
    'Segment Rotation': out.w,
  };
};
