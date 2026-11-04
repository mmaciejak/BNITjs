/**
 * blender-shader-web runtime.
 *
 * Rebuilds a Blender shader node graph (exported by the add-on in /exporter)
 * as a three.js TSL graph. Feature code lands from Phase 1 onward; see SPEC.md.
 */

/** Version of the graph export format this runtime understands. */
export const GRAPH_FORMAT_VERSION = 1;
