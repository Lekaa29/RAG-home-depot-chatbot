import { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import type { FootprintPoint, Door } from "../api";
import { useTheme } from "../ThemeContext";

const WALL_HEIGHT = 19; // same in both themes -- see theme.ts wallHeight
const WALL_THICKNESS = 1;
const NEON_RADIUS = 0.22; // thicker core tube, much more visible than before
const DOOR_HEIGHT = 10;
const FRAME_COLOR = "#3a3a38"; // dark anodized aluminum storefront framing

interface WallSegment {
  key: string;
  length: number;
  angle: number;
  midX: number;
  midZ: number;
}

function buildSegments(points: FootprintPoint[], doors: Door[]): WallSegment[] {
  const segments: WallSegment[] = [];

  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length];
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const length = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const dirX = dx / length;
    const dirZ = dz / length;

    // doors that land on this edge, as a position along it (0..length)
    const edgeDoors = doors
      .map((d) => ({ ...d, t: (d.x - p.x) * dirX + (d.z - p.z) * dirZ }))
      .filter((d) => d.t > 0 && d.t < length)
      .sort((a, b) => a.t - b.t);

    if (edgeDoors.length === 0) {
      segments.push({
        key: `${i}`,
        length,
        angle,
        midX: p.x + (dirX * length) / 2,
        midZ: p.z + (dirZ * length) / 2,
      });
      return;
    }

    let cursor = 0;
    const spans: [number, number][] = [];
    edgeDoors.forEach((d) => {
      const gapStart = d.t - d.width / 2;
      const gapEnd = d.t + d.width / 2;
      if (gapStart > cursor) spans.push([cursor, gapStart]);
      cursor = Math.max(cursor, gapEnd);
    });
    if (cursor < length) spans.push([cursor, length]);

    spans.forEach(([a, b], si) => {
      const segLength = b - a;
      const midT = (a + b) / 2;
      segments.push({
        key: `${i}-${si}`,
        length: segLength,
        angle,
        midX: p.x + dirX * midT,
        midZ: p.z + dirZ * midT,
      });
    });
  });

  return segments;
}

function WallSegmentMesh({
  s,
  plusZIsInterior,
}: {
  s: WallSegment;
  plusZIsInterior: boolean;
}) {
  const { theme, dark } = useTheme();

  const materials = useMemo(() => {
    // In dark mode, a self-emissive glow of each wall's own base color
    // guarantees it stays visually distinct regardless of shading angle --
    // a purely lit surface can render much darker than its authored color,
    // which was crushing every dark surface toward the same near-black.
    const interior = new THREE.MeshStandardMaterial({
      color: theme.wallInterior,
      metalness: 0.05,
      roughness: 0.55,
      emissive: dark ? theme.wallInterior : "#000000",
      emissiveIntensity: dark ? 0.5 : 0,
    });
    // plain flat exterior face, no texture -- the neon roofline tube is the
    // only accent now
    const exterior = new THREE.MeshStandardMaterial({
      color: theme.wallExterior,
      metalness: 0.4,
      roughness: 0.5,
      emissive: dark ? theme.wallExterior : "#000000",
      emissiveIntensity: dark ? 0.5 : 0,
    });
    // BoxGeometry face group order: +x, -x, +y, -y, +z, -z
    return plusZIsInterior
      ? [interior, interior, interior, interior, interior, exterior]
      : [interior, interior, interior, interior, exterior, interior];
  }, [plusZIsInterior, theme.wallInterior, theme.wallExterior, dark]);

  return (
    <group position={[s.midX, 0, s.midZ]} rotation={[0, -s.angle, 0]}>
      <mesh position={[0, WALL_HEIGHT / 2, 0]} castShadow receiveShadow material={materials}>
        <boxGeometry args={[s.length, WALL_HEIGHT, WALL_THICKNESS]} />
      </mesh>
      {/* yellow neon tube sitting on top of the wall, tracing the building's
          own footprint segment by segment -- unlit (toneMapped=false) so it
          reads as a true glowing light rather than a painted stripe, plus two
          wider additive-blended halo layers stacked around it for a much
          stronger, actually-glowing look without needing a bloom pass. */}
      <group position={[0, WALL_HEIGHT + NEON_RADIUS, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[NEON_RADIUS, NEON_RADIUS, s.length, 12]} />
          <meshBasicMaterial color={theme.wallTrim} toneMapped={false} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[NEON_RADIUS * 2.6, NEON_RADIUS * 2.6, s.length, 12]} />
          <meshBasicMaterial
            color={theme.wallTrim}
            toneMapped={false}
            transparent
            opacity={0.45}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh>
          <cylinderGeometry args={[NEON_RADIUS * 5, NEON_RADIUS * 5, s.length, 12]} />
          <meshBasicMaterial
            color={theme.wallTrim}
            toneMapped={false}
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    </group>
  );
}

function EntranceDoor({ x, z, width, rotationY }: Door) {
  const { theme } = useTheme();
  const panelGap = 0.3;
  const framePost = 0.4;
  const panelWidth = (width - panelGap) / 2 - framePost;

  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      {/* header above the opening */}
      <mesh position={[0, DOOR_HEIGHT + 0.5, 0]}>
        <boxGeometry args={[width + 1.6, 1, 1.2]} />
        <meshStandardMaterial color={theme.wallInterior} metalness={0} roughness={0.9} />
      </mesh>

      {/* aluminum side frame posts */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * (width + framePost)) / 2, DOOR_HEIGHT / 2, 0]} castShadow>
          <boxGeometry args={[framePost, DOOR_HEIGHT, 1.2]} />
          <meshStandardMaterial color={FRAME_COLOR} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* two sliding glass panels */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * (panelWidth + panelGap)) / 2, DOOR_HEIGHT / 2, 0]}>
          <boxGeometry args={[panelWidth, DOOR_HEIGHT, 0.15]} />
          <meshPhysicalMaterial
            color="#dce8ec"
            transparent
            opacity={0.35}
            metalness={0}
            roughness={0.05}
            transmission={0.6}
          />
        </mesh>
      ))}

      {/* center mullion where the two panels meet */}
      <mesh position={[0, DOOR_HEIGHT / 2, 0]}>
        <boxGeometry args={[0.1, DOOR_HEIGHT, 0.22]} />
        <meshStandardMaterial color={FRAME_COLOR} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* threshold */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[width + 0.6, 0.1, 1.4]} />
        <meshStandardMaterial color={FRAME_COLOR} metalness={0.5} roughness={0.5} />
      </mesh>

      {/* EXIT sign above the header, readable from either side */}
      {[0, Math.PI].map((ry) => (
        <Text
          key={ry}
          position={[0, DOOR_HEIGHT + 1.9, 0]}
          rotation={[0, ry, 0]}
          fontSize={1.4}
          letterSpacing={0.1}
          color="#c81e1e"
          anchorX="center"
          anchorY="middle"
        >
          EXIT
        </Text>
      ))}
    </group>
  );
}

export function Walls({ points, doors = [] }: { points: FootprintPoint[]; doors?: Door[] }) {
  const segments = buildSegments(points, doors);

  const center = points.reduce(
    (acc, p) => ({ x: acc.x + p.x / points.length, z: acc.z + p.z / points.length }),
    { x: 0, z: 0 }
  );

  return (
    <group>
      {segments.map((s) => {
        // local +Z (after rotation by -angle) points toward world (-sin, cos);
        // whichever side faces the building's rough center is the interior face.
        const plusZWorldX = -Math.sin(s.angle);
        const plusZWorldZ = Math.cos(s.angle);
        const towardCenterX = center.x - s.midX;
        const towardCenterZ = center.z - s.midZ;
        const plusZIsInterior = plusZWorldX * towardCenterX + plusZWorldZ * towardCenterZ > 0;
        return <WallSegmentMesh key={s.key} s={s} plusZIsInterior={plusZIsInterior} />;
      })}
      {doors.map((d, i) => (
        <EntranceDoor key={i} {...d} />
      ))}
    </group>
  );
}
