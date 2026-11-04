/** Types of the EXT_blender_shader_graph payload (schema/graph.schema.json, version 1). */

export const EXTENSION_NAME = 'EXT_blender_shader_graph';
export const GRAPH_FORMAT_VERSION = 1;

export type SocketType =
  | 'VALUE'
  | 'INT'
  | 'BOOLEAN'
  | 'VECTOR'
  | 'RGBA'
  | 'SHADER'
  | 'ROTATION'
  | 'STRING'
  | 'MENU'
  | 'MATRIX'
  | 'CLOSURE'
  | 'BUNDLE'
  | 'CUSTOM';

export type Scalar = number | boolean | string;
export type Value = Scalar | Scalar[];

export interface GraphSocket {
  name: string;
  type: SocketType;
  value?: Value;
}

export interface ColorRampData {
  interpolation: 'EASE' | 'CARDINAL' | 'LINEAR' | 'B_SPLINE' | 'CONSTANT';
  colorMode: 'RGB' | 'HSV' | 'HSL';
  hueInterpolation: 'NEAR' | 'FAR' | 'CW' | 'CCW';
  elements: { position: number; color: number[] }[];
  size: number;
  lut: number[];
}

export interface CurveData {
  points: { location: [number, number]; handle: string }[];
}

/** The lookup table Cycles builds for a curve node (see schema/graph.schema.json). */
export interface CurveTable {
  /** RGB: R(C(t)), G(C(t)), B(C(t)). VECTOR: X(t), Y(t), Z(t). FLOAT: one value. */
  kind: 'RGB' | 'VECTOR' | 'FLOAT';
  range: [number, number];
  size: number;
  values: number[];
}

export interface CurveMappingData {
  extend: 'HORIZONTAL' | 'EXTRAPOLATED';
  useClip: boolean;
  clip: [number, number, number, number];
  blackLevel?: [number, number, number];
  whiteLevel?: [number, number, number];
  tone?: 'STANDARD' | 'FILMLIKE';
  curves: CurveData[];
  table: CurveTable;
}

export interface GraphNode {
  type: string;
  name: string;
  label?: string;
  group?: string;
  properties?: Record<string, unknown>;
  data?: { colorRamp?: ColorRampData; curveMapping?: CurveMappingData };
  inputs?: Record<string, GraphSocket>;
  outputs?: Record<string, GraphSocket>;
}

export interface GraphLink {
  from: [string, string];
  to: [string, string];
}

export interface ShaderGraph {
  version: number;
  generator: { name: string; version: string; blender: string };
  material: string;
  materialPassIndex?: number;
  /** glTF TEXCOORD_i = names[i]; activeRender is the active render UV map. */
  uvMaps?: { names: string[]; activeRender: number };
  /** Filled in by the loader from the objects that use the material. */
  colorAttributes?: ColorAttributes;
  output: string;
  nodes: Record<string, GraphNode>;
  links?: GraphLink[];
  params?: {
    name: string;
    node: string;
    type: SocketType;
    default?: Value;
    min?: number;
    max?: number;
  }[];
}

/** Per-object data stored on glTF nodes (nodes[i].extensions.EXT_blender_shader_graph). */
export interface ObjectData {
  name: string;
  passIndex: number;
  color: [number, number, number, number];
  random: number;
  colorAttributes?: ColorAttributes;
  texspace?: { location: [number, number, number]; size: [number, number, number] };
}

/** Which glTF COLOR_n each Blender color attribute became (three.js: color, color_1, ...). */
export interface ColorAttributes {
  layers: { name: string; index: number }[];
  render?: string;
}

export interface ObjectExtension {
  object: ObjectData;
}

/** Key under which the loader stores ObjectExtension on Object3D.userData. */
export const USERDATA_KEY = 'blenderShaderGraph';
