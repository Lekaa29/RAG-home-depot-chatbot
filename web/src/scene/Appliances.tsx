import type { Appliance } from "../api";

const BODY_COLOR = "#f2f1ee"; // white/stainless appliance finish
const TRIM_COLOR = "#c9c7c0";
const DOOR_COLOR = "#2b2b28";

function Fridge({ x, z, rotation_deg }: Appliance) {
  const width = 5.2; // must match FRIDGE_SIZE in server/geometry.js
  const depth = 5.2;
  const height = 12;
  return (
    <group position={[x, 0, z]} rotation={[0, (rotation_deg * Math.PI) / 180, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={BODY_COLOR} metalness={0.3} roughness={0.4} />
      </mesh>
      {/* freezer/fridge door seam, upper third */}
      <mesh position={[0, height * 0.68, depth / 2 + 0.01]}>
        <boxGeometry args={[width * 0.96, 0.12, 0.04]} />
        <meshStandardMaterial color={TRIM_COLOR} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* door handle */}
      <mesh position={[width * 0.32, height * 0.55, depth / 2 + 0.16]} castShadow>
        <boxGeometry args={[0.2, height * 0.55, 0.2]} />
        <meshStandardMaterial color={DOOR_COLOR} metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Washer({ x, z, rotation_deg }: Appliance) {
  const width = 4.6; // must match WASHER_SIZE in server/geometry.js
  const depth = 4.6;
  const height = 6.4;
  return (
    <group position={[x, 0, z]} rotation={[0, (rotation_deg * Math.PI) / 180, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={BODY_COLOR} metalness={0.3} roughness={0.4} />
      </mesh>
      {/* porthole door -- dark ring only, the sole identifying feature */}
      <mesh position={[0, height * 0.42, depth / 2 + 0.02]}>
        <ringGeometry args={[1.1, 1.5, 32]} />
        <meshStandardMaterial color={DOOR_COLOR} metalness={0.3} roughness={0.5} side={2} />
      </mesh>
    </group>
  );
}

export function Appliances({ appliances }: { appliances: Appliance[] }) {
  return (
    <group>
      {appliances.map((a) =>
        a.type === "fridge" ? <Fridge key={a.id} {...a} /> : <Washer key={a.id} {...a} />
      )}
    </group>
  );
}
