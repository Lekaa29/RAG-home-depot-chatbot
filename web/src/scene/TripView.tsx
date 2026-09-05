import { Billboard, Html, Line } from "@react-three/drei";
import type { Trip } from "../pathfinding";
import { theme } from "../theme";

const ROUTE_LINE_HEIGHT = 30; // hovers at the tallest racking height -- must match TWO_STORY_HEIGHT in server/geometry.js
const PIN_Y = ROUTE_LINE_HEIGHT + 6; // tied to the racking, not wall height, so pins stay above the route line regardless of how tall the walls are
const POST_COLOR = "#4a4a46"; // plain painted-steel sign post

function StartBeacon({ x, z }: { x: number; z: number }) {
  return (
    <group>
      <Line points={[[x, ROUTE_LINE_HEIGHT, z], [x, PIN_Y - 3, z]]} color={POST_COLOR} lineWidth={2} />
      <Billboard position={[x, PIN_Y - 3, z]}>
        <mesh>
          <circleGeometry args={[1.3, 24]} />
          <meshBasicMaterial color="#173d19" />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[1.05, 24]} />
          <meshBasicMaterial color={theme.startBeacon} />
        </mesh>
      </Billboard>
    </group>
  );
}

function ItemPin({ x, z, icon, order }: { x: number; z: number; icon: string; order: number }) {
  return (
    <group>
      {/* plain sign post connecting the floor-level path up to the pin */}
      <Line points={[[x, ROUTE_LINE_HEIGHT, z], [x, PIN_Y, z]]} color={POST_COLOR} lineWidth={2} />

      {/* billboarded sign face -- always faces the camera regardless of orbit rotation */}
      <Billboard position={[x, PIN_Y, z]}>
        <mesh>
          <circleGeometry args={[2.6, 32]} />
          <meshBasicMaterial color="#1a1a18" />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[2.25, 32]} />
          <meshBasicMaterial color={theme.pin} />
        </mesh>
      </Billboard>

      {/* real emoji glyph + order badge, rendered as a screen-space overlay so
          the icon always displays correctly (SDF text fonts don't cover emoji) */}
      <Html position={[x, PIN_Y, z]} center style={{ pointerEvents: "none" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <div style={{ fontSize: 34, lineHeight: 1 }}>{icon}</div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#1a1a18",
              marginTop: 2,
              background: theme.pin,
              borderRadius: "50%",
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {order}
          </div>
        </div>
      </Html>
    </group>
  );
}

export function TripView({ trip }: { trip: Trip | null }) {
  if (!trip || trip.path.length < 2) return null;

  const vecs: [number, number, number][] = trip.path.map((p) => [p.x, ROUTE_LINE_HEIGHT, p.z]);
  const start = trip.path[0];

  return (
    <group>
      {/* wayfinding line hovers at the tallest racking height instead of the
          floor, so it isn't hidden by shelves along the way */}
      <Line points={vecs} color="#000000" lineWidth={5} />

      <StartBeacon x={start.x} z={start.z} />
      {trip.stops.map((s, i) => (
        <ItemPin key={i} x={s.x} z={s.z} icon={s.icon} order={i + 1} />
      ))}
    </group>
  );
}
