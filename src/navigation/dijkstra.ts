export interface GraphNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  distance: number;
  wheelchairAccessible: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PathResult {
  path: string[];
  totalDistance: number;
}

// Dijkstra's shortest-path algorithm.
// Returns the ordered sequence of node IDs from start to end
// and the total distance in metres. Returns null if no path exists.
export function findShortestPath(
  graph: Graph,
  startId: string,
  endId: string,
  wheelchairOnly: boolean = false
): PathResult | null {
  const adjacency = buildAdjacencyList(graph, wheelchairOnly);

  // dist[nodeId] = shortest known distance from startId
  const dist: Record<string, number> = {};
  // prev[nodeId] = previous node on the shortest path
  const prev: Record<string, string | null> = {};
  const visited = new Set<string>();

  for (const node of graph.nodes) {
    dist[node.id] = Infinity;
    prev[node.id] = null;
  }
  dist[startId] = 0;

  // Simple priority extraction — scan for the unvisited node
  // with smallest distance. Sufficient for a small campus graph;
  // swap in a min-heap if the graph grows large.
  while (true) {
    let currentId: string | null = null;
    let currentDist = Infinity;

    for (const nodeId of Object.keys(dist)) {
      if (!visited.has(nodeId) && dist[nodeId] < currentDist) {
        currentId = nodeId;
        currentDist = dist[nodeId];
      }
    }

    if (currentId === null || currentId === endId) break;
    visited.add(currentId);

    const neighbors = adjacency[currentId] ?? [];
    for (const { neighborId, distance } of neighbors) {
      if (visited.has(neighborId)) continue;
      const alt = currentDist + distance;
      if (alt < dist[neighborId]) {
        dist[neighborId] = alt;
        prev[neighborId] = currentId;
      }
    }
  }

  if (dist[endId] === Infinity) return null;

  // Reconstruct path by walking prev[] backwards from end to start
  const path: string[] = [];
  let current: string | null = endId;
  while (current !== null) {
    path.unshift(current);
    current = prev[current];
  }

  return { path, totalDistance: dist[endId] };
}

interface AdjacencyEntry {
  neighborId: string;
  distance: number;
}

function buildAdjacencyList(
  graph: Graph,
  wheelchairOnly: boolean
): Record<string, AdjacencyEntry[]> {
  const adj: Record<string, AdjacencyEntry[]> = {};

  for (const edge of graph.edges) {
    if (wheelchairOnly && !edge.wheelchairAccessible) continue;

    if (!adj[edge.from]) adj[edge.from] = [];
    if (!adj[edge.to]) adj[edge.to] = [];

    // Undirected graph — add both directions
    adj[edge.from].push({ neighborId: edge.to, distance: edge.distance });
    adj[edge.to].push({ neighborId: edge.from, distance: edge.distance });
  }

  return adj;
}
