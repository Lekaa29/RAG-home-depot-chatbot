import { Text } from "@react-three/drei";
import type { CheckoutCounter } from "../api";
import { theme } from "../theme";

const COUNTER_HEIGHT = 3.5;
const COUNTER_DEPTH = 2.2;
const METAL_COLOR = "#5a5a56";

function Counter({ x, z, width }: CheckoutCounter) {
  return (
    <group position={[x, 0, z]}>
      {/* counter body -- bone-white laminate */}
      <mesh position={[0, COUNTER_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, COUNTER_HEIGHT, COUNTER_DEPTH]} />
        <meshStandardMaterial color={theme.shelfDeck} metalness={0} roughness={0.8} />
      </mesh>

      {/* painted safety-yellow counter-top edge */}
      <mesh position={[0, COUNTER_HEIGHT + 0.06, 0]}>
        <boxGeometry args={[width + 0.1, 0.12, COUNTER_DEPTH + 0.1]} />
        <meshStandardMaterial color={theme.wallTrim} metalness={0} roughness={0.6} />
      </mesh>

      {/* register pole + screen */}
      <mesh position={[0, COUNTER_HEIGHT + 0.5, -COUNTER_DEPTH / 2 + 0.15]}>
        <cylinderGeometry args={[0.08, 0.08, 1, 8]} />
        <meshStandardMaterial color={METAL_COLOR} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, COUNTER_HEIGHT + 1.1, -COUNTER_DEPTH / 2 + 0.15]}>
        <boxGeometry args={[0.9, 0.6, 0.08]} />
        <meshStandardMaterial color="#2b2f33" emissive="#3a5566" emissiveIntensity={0.4} metalness={0.2} roughness={0.5} />
      </mesh>
    </group>
  );
}

const SIGN_HEIGHT = COUNTER_HEIGHT + 3.5;

export function CheckoutCounters({ counters }: { counters: CheckoutCounter[] }) {
  if (counters.length === 0) return null;
  const xs = counters.map((c) => c.x);
  const signX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const signZ = counters[0].z;

  return (
    <group>
      {counters.map((c) => (
        <Counter key={c.id} {...c} />
      ))}
      {/* hanging sign, readable from either side */}
      {[0, Math.PI].map((ry) => (
        <Text
          key={ry}
          position={[signX, SIGN_HEIGHT, signZ]}
          rotation={[0, ry, 0]}
          fontSize={2}
          letterSpacing={0.1}
          color={theme.textBright}
          anchorX="center"
          anchorY="middle"
        >
          CHECKOUT
        </Text>
      ))}
    </group>
  );
}
