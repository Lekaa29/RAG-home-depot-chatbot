import { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import type { FootprintPoint, Door } from "../api";
import { theme } from "../theme";

const WALL_HEIGHT = theme.wallHeight;
const WALL_THICKNESS = 1;
const TRIM_HEIGHT = 1.6; // painted signage band, not a thin glow line
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

// Procedural desert-cream brick texture, drawn once to a canvas and reused
// (cloned per wall so each segment can set its own tiling repeat).
let sharedBrickTexture: THREE.CanvasTexture | null = null;
function getBrickTexture(): THREE.CanvasTexture {
  if (sharedBrickTexture) return sharedBrickTexture;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = theme.brickMortar;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const brickW = 56;
  const brickH = 24;
  const gap = 4;
  const base = new THREE.Color(theme.brickBase);

  for (let y = -brickH; y < canvas.height + brickH; y += brickH + gap) {
    const row = Math.round(y / (brickH + gap));
    const offset = Math.abs(row % 2) * (brickW / 2 + gap / 2);
    for (let x = -brickW; x < canvas.width + brickW; x += brickW + gap) {
      const seed = Math.abs(Math.sin(row * 928.13 + x * 13.71) * 43758.5453) % 1;
      const shade = 0.92 + seed * 0.16;
      const c = base.clone().multiplyScalar(shade);
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(x + offset, y, brickW, brickH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  sharedBrickTexture = tex;
  return tex;
}

function WallSegmentMesh({
  s,
  plusZIsInterior,
}: {
  s: WallSegment;
  plusZIsInterior: boolean;
}) {
  const materials = useMemo(() => {
    const interior = new THREE.MeshStandardMaterial({ color: theme.wallInterior, roughness: 0.9 });
    const brickTex = getBrickTexture().clone();
    brickTex.repeat.set(Math.max(1, s.length / 9), Math.max(1, WALL_HEIGHT / 4.5));
    brickTex.needsUpdate = true;
    const exterior = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.88 });
    // BoxGeometry face group order: +x, -x, +y, -y, +z, -z
    return plusZIsInterior
      ? [interior, interior, interior, interior, interior, exterior]
      : [interior, interior, interior, interior, exterior, interior];
  }, [s.length, plusZIsInterior]);

  return (
    <group position={[s.midX, 0, s.midZ]} rotation={[0, -s.angle, 0]}>
      <mesh position={[0, WALL_HEIGHT / 2, 0]} castShadow receiveShadow material={materials}>
        <boxGeometry args={[s.length, WALL_HEIGHT, WALL_THICKNESS]} />
      </mesh>
      {/* painted safety-yellow signage band near the roofline, exterior side */}
      <mesh position={[0, WALL_HEIGHT - TRIM_HEIGHT / 2 - 0.5, 0.02]}>
        <boxGeometry args={[s.length, TRIM_HEIGHT, WALL_THICKNESS * 0.1]} />
        <meshStandardMaterial color={theme.wallTrim} metalness={0} roughness={0.7} />
      </mesh>
    </group>
  );
}

function EntranceDoor({ x, z, width, rotationY }: Door) {
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
