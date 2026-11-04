import { GRAPH_FORMAT_VERSION, type GraphLink, type ShaderGraph } from './types.js';

export class GraphFormatError extends Error {}

/** Cheap structural checks; the full contract is schema/graph.schema.json. */
export function parseGraph(input: unknown): ShaderGraph {
  if (typeof input !== 'object' || input === null)
    throw new GraphFormatError('graph is not an object');
  const graph = input as ShaderGraph;
  if (graph.version !== GRAPH_FORMAT_VERSION) {
    throw new GraphFormatError(
      `unsupported graph version ${String(graph.version)} (expected ${GRAPH_FORMAT_VERSION})`,
    );
  }
  if (typeof graph.nodes !== 'object' || graph.nodes === null) {
    throw new GraphFormatError('graph has no nodes');
  }
  if (!graph.nodes[graph.output]) {
    throw new GraphFormatError(`output node "${graph.output}" is missing`);
  }
  for (const link of graph.links ?? []) {
    if (!graph.nodes[link.from[0]] || !graph.nodes[link.to[0]]) {
      throw new GraphFormatError(
        `link ${link.from.join(':')} -> ${link.to.join(':')} references a missing node`,
      );
    }
  }
  return graph;
}

/** Map "nodeId\u0000inputIdentifier" -> link feeding it. */
export function indexLinks(links: GraphLink[] | undefined): Map<string, GraphLink> {
  const map = new Map<string, GraphLink>();
  for (const link of links ?? []) map.set(socketKey(link.to[0], link.to[1]), link);
  return map;
}

export function socketKey(nodeId: string, identifier: string): string {
  return `${nodeId}\u0000${identifier}`;
}
