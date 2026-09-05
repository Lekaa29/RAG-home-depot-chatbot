import { useMemo } from "react";
import { MOUSE, TOUCH, Shape } from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, Grid } from "@react-three/drei";
import type { Shelf, FootprintPoint, Door, CheckoutCounter, PartitionWall, Appliance, FloorLabel } from "../api";
import type { Trip } from "../pathfinding";
import { Shelves } from "./Shelves";
import { TripView } from "./TripView";
import { Walls } from "./Walls";
import { CheckoutCounters } from "./CheckoutCounters";
import { PartitionWalls } from "./PartitionWalls";
import { Appliances } from "./Appliances";
import { FloorLabels } from "./FloorLabels";
import { ZoomRig } from "./ZoomRig";
import { theme } from "../theme";

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Classic isometric elevation: camera direction (1,1,1) normalized means the
// angle from vertical is acos(1/sqrt(3)) ~= 54.7deg. Locking OrbitControls'
// polar angle to exactly this keeps the "same height and distance" isometric
// read while still letting the user rotate around the vertical (azimuth) axis.
const ISO_POLAR_ANGLE = Math.acos(1 / Math.sqrt(3));

// Zoom-out used to be bounded at 0.4 (2.5x the default view). Halving that
// zoomed-out range -- rather than halving the raw number, which would do the
// opposite -- puts the new floor halfway back to the default zoom of 1.
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 4.176; // user-picked zoom-in limit, read off the console log

export function Scene({
  shelves,
  footprint,
  doors,
  checkoutCounters,
  partitionWalls,
  appliances,
  floorLabels,
  bounds,
  trip,
}: {
  shelves: Shelf[];
  footprint: FootprintPoint[];
  doors: Door[];
  checkoutCounters: CheckoutCounter[];
  partitionWalls: PartitionWall[];
  appliances: Appliance[];
  floorLabels: FloorLabel[];
  bounds: Bounds;
  trip: Trip | null;
}) {
  // Memoized so these array/number identities stay stable across re-renders
  // (dropdown changes, route computation, etc). OrbitControls' `target` and
  // the camera's `position` re-sync to whatever is passed in on every render
  // where the reference changes -- with fresh array literals every render,
  // that was silently snapping any user pan/rotate back to center as soon as
  // the app re-rendered for an unrelated reason.
  const { center, camPos, viewSize, dist, width, depth } = useMemo(() => {
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const center: [number, number, number] = [
      (bounds.minX + bounds.maxX) / 2,
      0,
      (bounds.minZ + bounds.maxZ) / 2,
    ];
    const dist = Math.max(width, depth) * 1.6;
    const camPos: [number, number, number] = [
      center[0] + dist,
      dist,
      center[2] + dist,
    ];
    const viewSize = Math.max(width, depth) * 0.75;
    return { center, camPos, viewSize, dist, width, depth };
  }, [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ]);

  // Interior floor is cut to the exact building outline so "inside" reads as
  // a distinctly lighter surface than the exterior apron, not just a bigger
  // rectangle. ShapeGeometry builds in an XY plane that, once rotated flat,
  // maps local Y to world -Z -- negate z going in so the shape ends up right
  // side up and lines up with the walls (which are placed directly in x/z).
  const insideFloorShape = useMemo(() => {
    const shape = new Shape();
    footprint.forEach((p, i) => {
      if (i === 0) shape.moveTo(p.x, -p.z);
      else shape.lineTo(p.x, -p.z);
    });
    shape.closePath();
    return shape;
  }, [footprint]);

  return (
    <Canvas shadows dpr={[1, 2]}>
      <OrthographicCamera
        makeDefault
        position={camPos}
        zoom={1}
        left={-viewSize}
        right={viewSize}
        top={viewSize * 0.6}
        bottom={-viewSize * 0.6}
        near={0.1}
        far={4000}
        onUpdate={(cam) => cam.lookAt(...center)}
      />
      <OrbitControls
        target={center}
        enableRotate
        minPolarAngle={ISO_POLAR_ANGLE}
        maxPolarAngle={ISO_POLAR_ANGLE}
        enablePan
        enableZoom={false}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.PAN }}
      />
      <ZoomRig minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} />

      <color attach="background" args={[theme.bgVoid]} />
      <fog attach="fog" args={[theme.bgVoid, dist * 2.2, dist * 4]} />

      <ambientLight intensity={0.75} color="#fffdf5" />
      <directionalLight position={[100, 150, 80]} intensity={1.05} color="#fffaf0" castShadow />
      <directionalLight position={[-80, 60, -60]} intensity={0.4} color="#eef1f5" />

      {/* faint concrete control-joint lines, not a design centerpiece */}
      <Grid
        position={[center[0], 0, center[2]]}
        args={[width + 40, depth + 40]}
        cellSize={14}
        cellColor={theme.gridLine}
        sectionColor={theme.gridSection}
        fadeDistance={dist * 2}
        cellThickness={0.5}
        sectionThickness={0.8}
        infiniteGrid={false}
      />
      {/* exterior apron -- unchanged gray concrete */}
      <mesh position={[center[0], -0.05, center[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width + 40, depth + 40]} />
        <meshStandardMaterial color={theme.floorOutside} roughness={0.95} metalness={0} />
      </mesh>
      {/* interior floor -- much lighter, cut to the exact building outline */}
      <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <shapeGeometry args={[insideFloorShape]} />
        <meshStandardMaterial color={theme.floorInside} roughness={0.9} metalness={0} />
      </mesh>

      <Walls points={footprint} doors={doors} />
      <PartitionWalls walls={partitionWalls} />
      <Shelves shelves={shelves} />
      <CheckoutCounters counters={checkoutCounters} />
      <Appliances appliances={appliances} />
      <FloorLabels labels={floorLabels} />
      <TripView trip={trip} />
    </Canvas>
  );
}
