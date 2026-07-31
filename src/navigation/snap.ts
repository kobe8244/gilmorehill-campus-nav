import type { Graph, GraphEdge } from "./pathfinding";
import { assess, type RouteProfile } from "./accessibility";
import { metresBetween, type LatLng } from "./guidance";

// Joining an arbitrary position to the surveyed network.
//
// Routing from wherever someone happens to be standing is what separates a
// planner from a navigator. It cannot be done by picking the nearest
// junction: junctions can be a hundred metres apart, and the first
// instruction would then be measured from a place the traveller is not. The
// position is projected onto the nearest path instead, and that path is
// split at the projection so the route starts exactly where they are.

/**
 * How far from the surveyed network a position may be and still be routed
 * from. Beyond this the honest answer is that this system does not cover
 * where you are standing — the study area is four buildings and the paths
 * between them, not the whole campus.
 */
export const MAX_SNAP_M = 60;

/** Identifier given to the temporary node representing the traveller. */
export const YOU_ARE_HERE = "__you";

export interface SnapResult {
  edge: GraphEdge;
  /** The point on the path nearest the position given. */
  point: LatLng;
  /** Perpendicular distance from the position to the path, in metres. */
  distanceM: number;
  /** Index of the coordinate pair the projection falls between. */
  legIndex: number;
  /** Distance along the edge to the projection, in metres. */
  alongM: number;
}

const TO_RAD = Math.PI / 180;

/** Project p onto the segment a–b, in a local flat approximation. */
function project(p: LatLng, a: LatLng, b: LatLng) {
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos(p.lat * TO_RAD);
  const px = (p.lng - a.lng) * mPerLng;
  const py = (p.lat - a.lat) * mPerLat;
  const bx = (b.lng - a.lng) * mPerLng;
  const by = (b.lat - a.lat) * mPerLat;
  const lenSq = bx * bx + by * by;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  return {
    t,
    distanceM: Math.hypot(px - t * bx, py - t * by),
    point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
  };
}

/**
 * Nearest point on the network to a position.
 *
 * Only paths this traveller could actually use are considered. Snapping
 * someone in a wheelchair onto the flight of steps they are standing beside,
 * simply because it is two metres nearer than the ramp, would produce a
 * route that fails before it starts.
 */
function nearestOn(edges: GraphEdge[], position: LatLng): SnapResult | null {
  let best: SnapResult | null = null;
  for (const edge of edges) {
    const pts = edge.coords.map(([lng, lat]) => ({ lat, lng }));
    let along = 0;
    for (let i = 1; i < pts.length; i++) {
      const legLength = metresBetween(pts[i - 1], pts[i]);
      const { t, distanceM, point } = project(position, pts[i - 1], pts[i]);
      if (best === null || distanceM < best.distanceM) {
        best = { edge, point, distanceM, legIndex: i - 1, alongM: along + t * legLength };
      }
      along += legLength;
    }
  }
  return best;
}

export function snapToNetwork(
  graph: Graph,
  position: LatLng,
  profile: RouteProfile = "wheelchair"
): SnapResult | null {
  const usable = nearestOn(
    graph.edges.filter((e) => assess(e, profile).passable),
    position
  );
  if (usable && usable.distanceM <= MAX_SNAP_M) return usable;

  // Nothing this traveller can use is within reach. Fall back to the whole
  // network so the caller can still say how far away they are, which is more
  // helpful than reporting nothing at all.
  const anywhere = nearestOn(graph.edges, position);
  if (!usable) return anywhere;
  if (!anywhere) return usable;
  return anywhere.distanceM < usable.distanceM ? anywhere : usable;
}

/** Length of a polyline in metres. */
function lengthOf(pts: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += metresBetween(pts[i - 1], pts[i]);
  return total;
}

/**
 * A copy of the graph with the traveller inserted as a node.
 *
 * The path they are standing on is replaced by its two halves, which inherit
 * its surveyed attributes — the accessibility of half a path is the accessibility
 * of the path. Replacing rather than adding matters: leaving the original in
 * place would let the search slide past the traveller's position as though
 * they were not on it.
 */
export function withVirtualStart(graph: Graph, snap: SnapResult): Graph {
  const pts = snap.edge.coords.map(([lng, lat]) => ({ lat, lng }));
  const head = [...pts.slice(0, snap.legIndex + 1), snap.point];
  const tail = [snap.point, ...pts.slice(snap.legIndex + 1)];

  const toCoords = (list: LatLng[]): [number, number][] =>
    list.map((p) => [p.lng, p.lat] as [number, number]);

  const halves: GraphEdge[] = [];
  // A half of zero length appears when the traveller stands on a junction;
  // it would be a self-loop, so it is simply left out.
  if (head.length >= 2 && lengthOf(head) > 0.5) {
    halves.push({
      ...snap.edge,
      id: `${snap.edge.id}·a`,
      from: snap.edge.from,
      to: YOU_ARE_HERE,
      coords: toCoords(head),
      lengthM: Math.round(lengthOf(head)),
    });
  }
  if (tail.length >= 2 && lengthOf(tail) > 0.5) {
    halves.push({
      ...snap.edge,
      id: `${snap.edge.id}·b`,
      from: YOU_ARE_HERE,
      to: snap.edge.to,
      coords: toCoords(tail),
      lengthM: Math.round(lengthOf(tail)),
    });
  }

  // Standing exactly on a junction: no split is needed, just route from it.
  if (halves.length === 0) return graph;

  return {
    nodes: [...graph.nodes, { id: YOU_ARE_HERE, lat: snap.point.lat, lng: snap.point.lng }],
    edges: [...graph.edges.filter((e) => e.id !== snap.edge.id), ...halves],
  };
}

export interface CoverageVerdict {
  /** Whether a route can honestly be planned from here. */
  covered: boolean;
  /** Metres from the position to the nearest usable path. */
  distanceM: number;
  /** What to tell the traveller. */
  message: string;
}

/** Whether the surveyed network reaches the traveller, said plainly. */
export function coverageFor(snap: SnapResult | null): CoverageVerdict {
  if (!snap) {
    return {
      covered: false,
      distanceM: Infinity,
      message: "No surveyed paths were found at all. The network may have failed to load.",
    };
  }
  if (snap.distanceM > MAX_SNAP_M) {
    return {
      covered: false,
      distanceM: Math.round(snap.distanceM),
      message:
        `You are about ${Math.round(snap.distanceM)} m from the nearest surveyed path. ` +
        "This system covers only the four destinations and the paths between them, " +
        "so it cannot guide you from here. Choose a starting building instead.",
    };
  }
  if (snap.distanceM > 15) {
    return {
      covered: true,
      distanceM: Math.round(snap.distanceM),
      message:
        `Make your way about ${Math.round(snap.distanceM)} m to the nearest surveyed ` +
        "path, where the directions below begin. That first stretch has not been " +
        "surveyed, so take care.",
    };
  }
  return { covered: true, distanceM: Math.round(snap.distanceM), message: "" };
}
