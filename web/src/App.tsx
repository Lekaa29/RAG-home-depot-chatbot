import { useEffect, useState } from "react";
import {
  api,
  type Shelf,
  type Location,
  type Item,
  type NavGraph,
  type Footprint,
  type ChatMessage,
} from "./api";
import { computeMultiRoute, type Trip, type Stop } from "./pathfinding";
import { Scene } from "./scene/Scene";
import { Controls } from "./ui/Controls";
import { Chat } from "./ui/Chat";

// The shelf face to walk up to depends on which side its pickup node is on --
// paired-aisle shelves (2, 4, 6, ...) pick up from the east now that the west
// side backs onto a partition wall, so the stub has to approach from whichever
// side is actually open, not always the west edge.
function stopFromItem(item: Item, navGraph: NavGraph): Stop {
  const pickupNode = navGraph.nodes.find((n) => n.id === item.pickup_node_id);
  const approachFromEast = pickupNode ? pickupNode.x > item.x : false;
  return {
    x: approachFromEast ? item.x + item.width / 2 : item.x - item.width / 2,
    z: item.z,
    pickupNodeId: item.pickup_node_id,
    icon: item.icon,
    label: item.name,
  };
}

export default function App() {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [navGraph, setNavGraph] = useState<NavGraph | null>(null);
  const [footprint, setFootprint] = useState<Footprint | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [itemId, setItemId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! Tell me what you're shopping for and I'll plan the fastest route to grab it all." },
  ]);
  const [chatPendingItemNames, setChatPendingItemNames] = useState<string[]>([]);
  const [chatBusy, setChatBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.shelves(), api.locations(), api.items(), api.navgraph(), api.footprint()])
      .then(([s, l, i, g, f]) => {
        setShelves(s);
        setLocations(l);
        setItems(i);
        setNavGraph(g);
        setFootprint(f);
      })
      .catch((err) => setLoadError(String(err)));
  }, []);

  const selectedItem = items.find((i) => i.id === itemId) ?? null;
  const selectedLocation = locations.find((l) => l.id === locationId) ?? null;

  function handleFindRoute() {
    if (!navGraph || !selectedItem || !selectedLocation) return;
    setTrip(
      computeMultiRoute(navGraph, { x: selectedLocation.x, z: selectedLocation.z }, [
        stopFromItem(selectedItem, navGraph),
      ])
    );
  }

  async function handleChatSend(message: string) {
    const userMsg: ChatMessage = { role: "user", content: message };
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setChatBusy(true);

    try {
      const data = await api.chat(message, nextHistory.slice(-8), selectedLocation?.name ?? null);
      setChatMessages((h) => [...h, { role: "assistant", content: data.reply }]);

      const mergedItemNames = Array.from(new Set([...chatPendingItemNames, ...data.items]));

      let activeLocationId = locationId;
      if (data.location) {
        const match = locations.find((l) => l.name.toLowerCase() === data.location!.toLowerCase());
        if (match) {
          activeLocationId = match.id;
          setLocationId(match.id);
        }
      }
      const activeLocation = locations.find((l) => l.id === activeLocationId) ?? null;

      const resolvedItems = mergedItemNames
        .map((name) => items.find((it) => it.name.toLowerCase() === name.toLowerCase()))
        .filter((it): it is Item => Boolean(it));

      if (navGraph && activeLocation && resolvedItems.length > 0) {
        setTrip(
          computeMultiRoute(
            navGraph,
            { x: activeLocation.x, z: activeLocation.z },
            resolvedItems.map((it) => stopFromItem(it, navGraph))
          )
        );
        setChatPendingItemNames([]);
      } else {
        setChatPendingItemNames(mergedItemNames);
      }
    } catch (err) {
      setChatMessages((h) => [...h, { role: "assistant", content: `Sorry, something went wrong: ${String(err)}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="error">
        Could not reach the API server ({loadError}). Is it running on
        http://localhost:4000?
      </div>
    );
  }

  return (
    <div className="app">
      <div className="sidebar">
        <Controls
          items={items}
          locations={locations}
          itemId={itemId}
          locationId={locationId}
          onItemChange={(id) => {
            setItemId(id);
            setTrip(null);
          }}
          onLocationChange={(id) => {
            setLocationId(id);
            setTrip(null);
          }}
          onFindRoute={handleFindRoute}
          distanceFt={trip ? trip.totalDistance : null}
        />
        <Chat messages={chatMessages} busy={chatBusy} onSend={handleChatSend} />
      </div>
      <div className="scene-wrap">
        {footprint && (
          <Scene
            shelves={shelves}
            footprint={footprint.points}
            doors={footprint.doors}
            checkoutCounters={footprint.checkoutCounters}
            partitionWalls={footprint.partitionWalls}
            appliances={footprint.appliances}
            floorLabels={footprint.floorLabels}
            bounds={footprint.bounds}
            trip={trip}
          />
        )}
      </div>
    </div>
  );
}
