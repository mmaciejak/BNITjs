import { Vector3, type Object3D } from 'three/webgpu';
import {
  cameraPosition,
  cameraViewMatrix,
  mix,
  normalWorld,
  positionLocal,
  positionWorld,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import type { Vec3Node } from '../graph/convert.js';
import { type ObjectExtension, USERDATA_KEY } from '../graph/types.js';

/**
 * glTF is Y-up, Blender is Z-up. The Blender glTF exporter writes (x, y, z)_blender as
 * (x, z, −y)_gltf, so (x, y, z)_blender = (x, −z, y)_gltf. Works for points and directions, in
 * object or world space.
 */
export function toBlender(v: Vec3Node): Vec3Node {
  return vec3(v.x, v.z.negate(), v.y);
}

function objectData(object: Object3D | null | undefined) {
  return (object?.userData?.[USERDATA_KEY] as ObjectExtension | undefined)?.object;
}

/** Per-object uniform read from the data the loader stored in userData (see loader/plugin.ts). */
function perObject(
  read: (object: Object3D | null | undefined) => Vector3 | undefined,
  fallback: Vector3,
) {
  const target = new Vector3();
  return uniform(fallback.clone()).onObjectUpdate(({ object }) => {
    const v = read(object);
    return v ? target.copy(v) : target.copy(fallback);
  });
}

const fromArray = (a: number[] | undefined) => (a ? new Vector3(a[0], a[1], a[2]) : undefined);

/** Blender texture space (Generated coordinates) of the object being drawn. */
export function texspaceUniforms() {
  return {
    location: perObject((o) => fromArray(objectData(o)?.texspace?.location), new Vector3(0, 0, 0)),
    size: perObject((o) => fromArray(objectData(o)?.texspace?.size), new Vector3(1, 1, 1)),
  };
}

/** Generated texture coordinates (the default Vector of procedural textures). */
export function generatedCoords(): Vec3Node {
  const space = texspaceUniforms();
  return toBlender(positionLocal).sub(space.location.sub(space.size)).div(space.size.mul(2));
}

/** 1 while rendering with an orthographic camera, 0 otherwise. */
export function orthoFlag() {
  return uniform(0).onRenderUpdate(({ camera }) =>
    (camera as { isOrthographicCamera?: boolean } | null)?.isOrthographicCamera ? 1 : 0,
  );
}

/**
 * Cycles' sd->wi in Blender world axes: unit vector from the shading point towards the viewer.
 * Orthographic cameras use their constant backward direction.
 */
export function viewDirBlender(): Vec3Node {
  const perspective = cameraPosition.sub(positionWorld).normalize();
  // Camera backward (+Z of the camera) in world space: third row of the view matrix.
  const backward = vec4(0, 0, 1, 0).mul(cameraViewMatrix).xyz.normalize();
  return toBlender(mix(perspective, backward, orthoFlag()));
}

/** Shading normal (Cycles' sd->N) in Blender world axes. */
export function shadingNormalBlender(): Vec3Node {
  return toBlender(normalWorld);
}
