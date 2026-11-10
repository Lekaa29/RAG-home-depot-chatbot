import { useMemo } from "react";
import { MOUSE, TOUCH, Shape } from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
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
import { useTheme } from "../ThemeContext";

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
  const { theme, dark } = useTheme();

  // Memoized so these array/number identities stay stable across re-renders
  // (dropdown changes, route computation, etc). OrbitControls' `target` and
  // the camera's `position` re-sync to whatever is passed in on every render
  // where the reference changes -- with fresh array literals every render,
  // that was silently snapping any user pan/rotate back to center as soon as
  // the app re-rendered for an unrelated reason.
  const { center, camPos, viewSize, dist } = useMemo(() => {
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
    return { center, camPos, viewSize, dist };
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

  // flat: disables the default filmic tone mapping, which crushes dark
  // tones together -- fine in light mode where colors sit in the bright
  // range, but it was flattening the dark theme's whole gray ramp toward
  // black. Flat rendering reproduces authored colors literally instead.
  return (
    <Canvas shadows dpr={[1, 2]} flat>
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

      {dark ? (
        <>
          <ambientLight intensity={0.55} color="#7c8790" />
          <directionalLight position={[100, 150, 80]} intensity={0.55} color="#8a97a3" castShadow />
          <directionalLight position={[-80, 60, -60]} intensity={0.3} color="#5c6870" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.7} color="#f4f8ff" />
          <directionalLight position={[100, 150, 80]} intensity={1.05} color="#f2f6ff" castShadow />
          <directionalLight position={[-80, 60, -60]} intensity={0.45} color="#e4ecf5" />
        </>
      )}

      {/* floor is only ever the building's own footprint -- no exterior
          apron, no grid overlay, just the whitest possible flat white. In
          dark mode, a self-emissive floor of its own base color guarantees
          it reads as a distinct step regardless of shading angle -- a
          shaded surface can render much darker than its authored color, and
          lit-vs-unlit brightness was crushing every dark surface together. */}
      <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <shapeGeometry args={[insideFloorShape]} />
        <meshStandardMaterial
          color={theme.floorInside}
          roughness={0.4}
          metalness={0}
          emissive={dark ? theme.floorInside : "#000000"}
          emissiveIntensity={dark ? 0.6 : 0}
        />
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
