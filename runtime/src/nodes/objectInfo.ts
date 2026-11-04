import { Vector3 } from 'three/webgpu';
import { float } from 'three/tsl';
import type { NodeImpl } from '../graph/evaluate.js';
import { objectData, perObject, perObjectFloat, toBlender } from './space.js';

const worldPosition = new Vector3();

/**
 * Object Info. Location is the object's world position; Color, Alpha, Object Index (pass index)
 * and Random come from the per-object data the exporter writes. Random matches Cycles for
 * non-instanced objects. Material Index is the material pass index.
 */
export const objectInfo: NodeImpl = (ctx) => {
  const location = perObject(
    (object) => (object ? object.getWorldPosition(worldPosition) : undefined),
    new Vector3(),
  );
  const color = perObject(
    (object) => {
      const c = objectData(object)?.color;
      return c ? new Vector3(c[0], c[1], c[2]) : undefined;
    },
    new Vector3(1, 1, 1),
  );
  return {
    Location: toBlender(location),
    Color: color,
    Alpha: perObjectFloat((object) => objectData(object)?.color[3], 1),
    'Object Index': perObjectFloat((object) => objectData(object)?.passIndex, 0),
    'Material Index': float(ctx.graph.materialPassIndex ?? 0),
    Random: perObjectFloat((object) => objectData(object)?.random, 0),
  };
};
