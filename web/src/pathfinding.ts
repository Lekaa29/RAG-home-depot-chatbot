import type { NavGraph, NavNode } from "./api";

type Adjacency = Map<number, { to: number; weight: number }[]>;

function buildAdjacency(graph: NavGraph): Adjacency {
  const adj: Adjacency = new Map();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    adj.get(edge.from_id)?.push({ to: edge.to_id, weight: edge.weight });
    adj.get(edge.to_id)?.push({ to: edge.from_id, weight: edge.weight });
  }
  return adj;
}

function dist(a: NavNode, b: NavNode) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function nearestNode(graph: NavGraph, x: number, z: number): NavNode {
  let best = graph.nodes[0];
  let bestDist = Infinity;
  for (const node of graph.nodes) {
    const d = Math.hypot(node.x - x, node.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

// Plain A* over the walkway/road graph (tens of nodes, no need for a library).
export function aStar(graph: NavGraph, startId: number, goalId: number): NavNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const adj = buildAdjacency(graph);
  const goal = byId.get(goalId)!;

  const gScore = new Map<number, number>([[startId, 0]]);
  const fScore = new Map<number, number>([[startId, dist(byId.get(startId)!, goal)]]);
  const cameFrom = new Map<number, number>();
  const open = new Set<number>([startId]);

  while (open.size > 0) {
    let current = -1;
    let currentF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        current = id;
      }
    }

    if (current === goalId) {
      const path: NavNode[] = [byId.get(current)!];
      let cur = current;
      while (cameFrom.has(cur)) {
        cur = cameFrom.get(cur)!;
        path.unshift(byId.get(cur)!);
      }
      return path;
    }

    open.delete(current);
    for (const { to, weight } of adj.get(current) ?? []) {
      const tentativeG = (gScore.get(current) ?? Infinity) + weight;
      if (tentativeG < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current);
        gScore.set(to, tentativeG);
        fScore.set(to, tentativeG + dist(byId.get(to)!, goal));
        open.add(to);
      }
    }
  }

  return []; // no path found
}

export interface RoutePoint {
  x: number;
  z: number;
}

// Dijkstra from a single source to every other node -- used to build an
// all-pairs distance matrix for the small multi-stop TSP below.
function dijkstraFrom(graph: NavGraph, startId: number): Map<number, number> {
  const adj = buildAdjacency(graph);
  const dist = new Map<number, number>(graph.nodes.map((n) => [n.id, Infinity]));
  dist.set(startId, 0);
  const visited = new Set<number>();

  while (visited.size < graph.nodes.length) {
    let u = -1;
    let ud = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < ud) {
        ud = d;
        u = id;
      }
    }
    if (u === -1) break;
    visited.add(u);
    for (const { to, weight } of adj.get(u) ?? []) {
      const nd = ud + weight;
      if (nd < (dist.get(to) ?? Infinity)) dist.set(to, nd);
    }
  }
  return dist;
}

export interface Stop {
  x: number;
  z: number;
  pickupNodeId: number;
  icon: string;
  label: string;
}

export interface Trip {
  path: RoutePoint[];
  stops: Stop[];
  totalDistance: number;
}

function pathLength(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return total;
}

// Nearest-neighbor construction + 2-opt local search over the walkway graph
// distances -- a fixed start, visiting every stop once, no return trip. Exact
// TSP isn't needed at this scale; 2-opt gets within a few percent of optimal
// for the handful of stops a shopping list realistically has.
export function computeMultiRoute(
  graph: NavGraph,
  from: { x: number; z: number },
  stops: Stop[]
): Trip {
  if (stops.length === 0) return { path: [{ x: from.x, z: from.z }], stops: [], totalDistance: 0 };

  const startNode = nearestNode(graph, from.x, from.z);
  const nodeIds = [startNode.id, ...stops.map((s) => s.pickupNodeId)];
  const distFrom = nodeIds.map((id) => dijkstraFrom(graph, id));
  const D = (i: number, j: number) => distFrom[i].get(nodeIds[j]) ?? Infinity;

  const n = stops.length;
  const unvisited = new Set(Array.from({ length: n }, (_, i) => i + 1));
  let order: number[] = [];
  let current = 0;
  while (unvisited.size > 0) {
    let best = -1;
    let bestD = Infinity;
    for (const j of unvisited) {
      const d = D(current, j);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    order.push(best);
    unvisited.delete(best);
    current = best;
  }

  const orderLength = (seq: number[]) => {
    let total = 0;
    let prev = 0;
    for (const idx of seq) {
      total += D(prev, idx);
      prev = idx;
    }
    return total;
  };

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (orderLength(candidate) + 1e-6 < orderLength(order)) {
          order = candidate;
          improved = true;
        }
      }
    }
  }

  const path: RoutePoint[] = [{ x: from.x, z: from.z }];
  const orderedStops: Stop[] = [];
  let currentNodeId = startNode.id;
  for (const idx of order) {
    const stop = stops[idx - 1];
    const nodePath = aStar(graph, currentNodeId, stop.pickupNodeId);
    for (const n2 of nodePath) path.push({ x: n2.x, z: n2.z });
    const pickup = nodePath[nodePath.length - 1] ?? { x: stop.x, z: stop.z };
    path.push({ x: stop.x, z: stop.z }); // stub in to the shelf face
    path.push({ x: pickup.x, z: pickup.z }); // stub back out to the aisle
    currentNodeId = stop.pickupNodeId;
    orderedStops.push(stop);
  }

  return { path, stops: orderedStops, totalDistance: pathLength(path) };
}
