import { edgeCost, type RouteProfile } from "./accessibility";

export interface GraphNode {
  id: string;
  lat: number;
  lng: number;
}

// Accessibility attributes collected during the field survey. `null` means
// "not surveyed yet" and is deliberately distinct from a measured `false`.
export interface SurveyAttributes {
  stepFree: boolean | null;
  stepCount: number | null;
  ramp: boolean | null;
  handrail: boolean | null;
  gradientPct: number | null;
  surface: string | null;
  surfaceCondition: string | null;
  widthM: number | null;
  droppedKerb: string | null;
  tactilePaving: boolean | null;
  lit: boolean | null;
  seatingNearby: boolean | null;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  lengthM: number;
  /** OSM highway type — `steps` is trusted even before surveying. */
  highway: string;
  tier: string;
  /** Full geometry as [lng, lat] pairs, so a drawn route follows the path. */
  coords: [number, number][];
  survey: SurveyAttributes;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Route {
  /** Node IDs from start to end. */
  nodeIds: string[];
  /** Edges traversed, in order — carries the geometry and the survey data. */
  edges: GraphEdge[];
  /** True walking distance in metres. */
  distanceM: number;
  /** Search cost in "effort metres"; equals distanceM on the shortest profile. */
  costM: number;
}

interface Neighbour {
  nodeId: string;
  edge: GraphEdge;
}

function buildAdjacency(graph: Graph): Map<string, Neighbour[]> {
  const adj = new Map<string, Neighbour[]>();
  const add = (from: string, to: string, edge: GraphEdge) => {
    const list = adj.get(from);
    if (list) list.push({ nodeId: to, edge });
    else adj.set(from, [{ nodeId: to, edge }]);
  };
  // Paths are walkable in both directions.
  for (const edge of graph.edges) {
    add(edge.from, edge.to, edge);
    add(edge.to, edge.from, edge);
  }
  return adj;
}

// Great-circle distance in metres — used as the A* heuristic.
export function haversine(a: GraphNode, b: GraphNode): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// A* search over the campus network.
//
// The heuristic is straight-line distance to the goal. Because every cost
// multiplier in accessibility.ts is at least 1, the estimate can never
// exceed the true remaining cost, which is the condition for A* to return
// an optimal route rather than merely a plausible one.
//
// Setting the profile to "accessible" swaps distance for the accessibility
// cost, so the same search yields the step-free route instead of the short
// one. Returns null when no usable route exists under that profile.
export function findRoute(
  graph: Graph,
  startId: string,
  endId: string,
  profile: RouteProfile = "shortest"
): Route | null {
  if (startId === endId) return { nodeIds: [startId], edges: [], distanceM: 0, costM: 0 };

  const adj = buildAdjacency(graph);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const goal = nodeById.get(endId);
  if (!goal || !nodeById.has(startId)) return null;

  const gScore = new Map<string, number>([[startId, 0]]);
  const cameFrom = new Map<string, { nodeId: string; edge: GraphEdge }>();
  const open = new Set<string>([startId]);
  const closed = new Set<string>();

  const heuristic = (id: string) => {
    const n = nodeById.get(id);
    return n ? haversine(n, goal) : 0;
  };

  while (open.size > 0) {
    // Pick the open node with the lowest f = g + h. A linear scan is ample
    // for a campus-sized graph; a binary heap would only pay off in the
    // thousands of nodes.
    let current: string | null = null;
    let bestF = Infinity;
    for (const id of open) {
      const f = (gScore.get(id) ?? Infinity) + heuristic(id);
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }
    if (current === null) break;

    if (current === endId) {
      // Walk the parent chain back to the start, then reverse it.
      const nodeIds: string[] = [current];
      const edges: GraphEdge[] = [];
      let cursor = current;
      while (cameFrom.has(cursor)) {
        const step = cameFrom.get(cursor)!;
        edges.push(step.edge);
        nodeIds.push(step.nodeId);
        cursor = step.nodeId;
      }
      nodeIds.reverse();
      edges.reverse();
      return {
        nodeIds,
        edges,
        distanceM: edges.reduce((sum, e) => sum + e.lengthM, 0),
        costM: gScore.get(endId) ?? 0,
      };
    }

    open.delete(current);
    closed.add(current);

    for (const { nodeId, edge } of adj.get(current) ?? []) {
      if (closed.has(nodeId)) continue;
      const step = edgeCost(edge, profile);
      if (step === null) continue; // impassable under this profile

      const tentative = (gScore.get(current) ?? Infinity) + step;
      if (tentative < (gScore.get(nodeId) ?? Infinity)) {
        gScore.set(nodeId, tentative);
        cameFrom.set(nodeId, { nodeId: current, edge });
        open.add(nodeId);
      }
    }
  }

  return null;
}
