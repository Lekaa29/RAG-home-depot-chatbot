export interface Shelf {
  id: number;
  aisle_num: number;
  bay_index: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation_deg: number;
  height: number;
  columns: number;
  pickup_node_id: number;
}

export interface Location {
  id: number;
  name: string;
  kind: string;
  x: number;
  z: number;
}

export interface Item {
  id: number;
  name: string;
  notes: string;
  icon: string;
  shelf_id: number;
  column_index: number;
  aisle_num: number;
  bay_index: number;
  x: number;
  z: number;
  width: number;
  columns: number;
  pickup_node_id: number;
}

export interface NavNode {
  id: number;
  x: number;
  z: number;
}

export interface NavEdge {
  from_id: number;
  to_id: number;
  weight: number;
}

export interface NavGraph {
  nodes: NavNode[];
  edges: NavEdge[];
}

export interface FootprintPoint {
  x: number;
  z: number;
}

export interface Door {
  x: number;
  z: number;
  width: number;
  rotationY: number;
}

export interface CheckoutCounter {
  id: number;
  x: number;
  z: number;
  width: number;
}

export interface PartitionWall {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

export interface Appliance {
  id: number;
  type: "fridge" | "washer";
  x: number;
  z: number;
  rotation_deg: number;
}

export interface FloorLabel {
  id: number;
  text: string;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface Footprint {
  points: FootprintPoint[];
  doors: Door[];
  checkoutCounters: CheckoutCounter[];
  partitionWalls: PartitionWall[];
  appliances: Appliance[];
  floorLabels: FloorLabel[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
  items: string[];
  location: string | null;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  shelves: () => getJSON<Shelf[]>("/api/shelves"),
  locations: () => getJSON<Location[]>("/api/locations"),
  items: () => getJSON<Item[]>("/api/items"),
  navgraph: () => getJSON<NavGraph>("/api/navgraph"),
  footprint: () => getJSON<Footprint>("/api/footprint"),
  async chat(message: string, history: ChatMessage[], knownLocation: string | null): Promise<ChatResponse> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, knownLocation }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `/api/chat -> ${res.status}`);
    return data as ChatResponse;
  },
};
