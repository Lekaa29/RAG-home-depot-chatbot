import type { PartitionWall } from "../api";
import { theme } from "../theme";

// Solid interior partitions between paired aisles (1&2, 3&4, ...), replacing
// what used to be a walkway. Plain white interior finish -- these are never
// seen from outside, so no brick treatment like the building's exterior walls.
export function PartitionWalls({ walls }: { walls: PartitionWall[] }) {
  return (
    <group>
      {walls.map((w, i) => (
        <mesh key={i} position={[w.x, w.height / 2, w.z]} castShadow receiveShadow>
          <boxGeometry args={[w.width, w.height, w.depth]} />
          <meshStandardMaterial color={theme.wallInterior} metalness={0} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
