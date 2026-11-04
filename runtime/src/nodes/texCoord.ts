import {
  cameraProjectionMatrix,
  cameraViewMatrix,
  mix,
  normalLocal,
  normalView,
  positionLocal,
  positionView,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { texspaceUniforms, toBlender } from './space.js';

/**
 * Texture Coordinate. All outputs are in Blender's conventions:
 *
 * - UV: first UV map, V flipped back (glTF puts the UV origin at the top left).
 * - Generated: object-space position normalised to the mesh texture space,
 *   (p − (location − size)) / (2·size), using the texture space the exporter writes per object.
 * - Object: object-space position (Blender axes). Normal: object-space normal.
 * - Camera: view-space position with +Z in front of the camera.
 * - Window: normalised screen position, (0, 0) at the bottom left, z = 0.
 * - Reflection: world-space reflection of the view direction, −reflect(V, N); orthographic
 *   cameras use their constant view direction, as Blender does.
 */
export const texCoord: NodeImpl = (ctx) => {
  if (ctx.prop<string | undefined>('object', undefined)) {
    ctx.warn(
      'the Object setting (coordinates of another object) is not supported; using this object',
    );
  }
  if (ctx.prop('from_instancer', false)) ctx.warn('From Instancer is not supported');

  const uv0 = uv(0);
  const space = texspaceUniforms();
  const objectPos = toBlender(positionLocal);
  const generated = objectPos.sub(space.location.sub(space.size)).div(space.size.mul(2));

  const clip = cameraProjectionMatrix.mul(vec4(positionView, 1));
  const window = vec3(clip.xy.div(clip.w).mul(0.5).add(0.5), 0);

  // Orthographic cameras look along a constant direction, as in Blender.
  const isOrtho = uniform(0).onRenderUpdate(({ camera }) =>
    (camera as { isOrthographicCamera?: boolean } | null)?.isOrthographicCamera ? 1 : 0,
  );
  const toCamera = mix(positionView.negate().normalize(), vec3(0, 0, 1), isOrtho);
  const n = normalView;
  const reflectView = n.mul(n.dot(toCamera).mul(2)).sub(toCamera);
  const reflectWorld = vec4(reflectView, 0).mul(cameraViewMatrix).xyz.normalize();

  return {
    Generated: generated,
    Normal: toBlender(normalLocal).normalize(),
    UV: vec3(uv0.x, uv0.y.oneMinus(), 0),
    Object: objectPos,
    Camera: vec3(positionView.x, positionView.y, positionView.z.negate()),
    Window: window,
    Reflection: toBlender(reflectWorld),
  };
};
