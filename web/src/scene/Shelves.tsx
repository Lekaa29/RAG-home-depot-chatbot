import { Text } from "@react-three/drei";
import type { Shelf } from "../api";
import { theme } from "../theme";

const DECK_LEVELS = 4; // number of horizontal shelf levels
const DECK_THICKNESS = 0.25;
const FRAME_COLOR = theme.shelfFrame;
const DECK_COLOR = theme.shelfDeck;

function ShelfRack({ shelf }: { shelf: Shelf }) {
  const { x, z, width, depth, height, rotation_deg, columns } = shelf;
  const frameThickness = Math.min(0.6, width);
  const frameSpacing = 15;
  const frameCount = Math.max(2, Math.round(depth / frameSpacing) + 1);

  // thin ticks on the bottom deck marking where one column ends and the
  // next begins, so columns are visually legible without cluttering every
  // deck level.
  const columnTicks =
    columns > 1
      ? Array.from({ length: columns - 1 }, (_, i) => -depth / 2 + ((i + 1) / columns) * depth)
      : [];

  // built in local space (rack centered on its own origin, running along
  // local z) then the whole group is placed/rotated -- this is what makes
  // rotation_deg actually turn the rack instead of just being stored data.
  const frames = Array.from({ length: frameCount }, (_, i) => {
    const t = frameCount === 1 ? 0.5 : i / (frameCount - 1);
    return -depth / 2 + t * depth;
  });

  const deckHeights = Array.from(
    { length: DECK_LEVELS },
    (_, i) => ((i + 1) / DECK_LEVELS) * height
  );

  return (
    <group position={[x, 0, z]} rotation={[0, (rotation_deg * Math.PI) / 180, 0]}>
      {/* uprights -- painted safety-yellow steel racking */}
      {frames.map((fz, i) => (
        <mesh key={`frame-${i}`} position={[0, height / 2, fz]} castShadow>
          <boxGeometry args={[width, height, frameThickness]} />
          <meshStandardMaterial color={FRAME_COLOR} metalness={0.35} roughness={0.55} />
        </mesh>
      ))}

      {/* deck levels -- bone-white shelf decking. The top level is left open
          (no solid cap) since real racking isn't an enclosed bookshelf. */}
      {deckHeights.map((h, i) => {
        const isTopDeck = i === deckHeights.length - 1;
        return (
          <mesh key={`deck-${i}`} position={[0, h, 0]} receiveShadow={!isTopDeck}>
            <boxGeometry args={[width * 1.15, DECK_THICKNESS, depth]} />
            <meshStandardMaterial
              color={DECK_COLOR}
              metalness={0}
              roughness={0.85}
              transparent={isTopDeck}
              opacity={isTopDeck ? 0 : 1}
              depthWrite={!isTopDeck}
            />
          </mesh>
        );
      })}

      {/* column-boundary ticks on the bottom deck only */}
      {columnTicks.map((tz, i) => (
        <mesh key={`tick-${i}`} position={[0, deckHeights[0] + DECK_THICKNESS / 2 + 0.01, tz]}>
          <boxGeometry args={[width * 1.1, 0.03, 0.06]} />
          <meshStandardMaterial color={theme.textDim} />
        </mesh>
      ))}
    </group>
  );
}

export function Shelves({ shelves }: { shelves: Shelf[] }) {
  return (
    <group>
      {shelves.map((s) => (
        <ShelfRack key={s.id} shelf={s} />
      ))}
      {/* every individual shelf unit gets its own number -- not just once per
          aisle -- so any specific rack can be referenced later. */}
      {shelves.map((s) => (
        <Text
          key={`label-${s.id}`}
          position={[s.x, s.height + 2, s.z]}
          fontSize={1.8}
          color={theme.textBright}
          anchorX="center"
          anchorY="middle"
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {s.id}
        </Text>
      ))}
    </group>
  );
}
