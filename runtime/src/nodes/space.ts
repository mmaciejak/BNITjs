import { Vector3, type Object3D } from 'three/webgpu';
import { uniform, vec3 } from 'three/tsl';
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
