import { Line, Text } from "@react-three/drei";
import type { FloorLabel } from "../api";
import { theme } from "../theme";

const LINE_Y = 0.03;
const TRACE_COLOR = theme.shelfFrame;
const LABEL_GAP = 3; // how far outside the side edge the text sits

// A PCB-trace-style zone outline: a fat line with 45deg-cut ("chamfered")
// corners, like copper traces on a circuit board, with the department name
// set outside the front edge rather than crowding the middle of the zone.
function ZoneOutline({ label }: { label: FloorLabel }) {
  const hw = label.width / 2;
  const hd = label.depth / 2;
  const chamfer = Math.min(hw, hd, 3);

  const outline: [number, number][] = [
    [-hw + chamfer, -hd],
    [hw - chamfer, -hd],
    [hw, -hd + chamfer],
    [hw, hd - chamfer],
    [hw - chamfer, hd],
    [-hw + chamfer, hd],
    [-hw, hd - chamfer],
    [-hw, -hd + chamfer],
  ];
  const points: [number, number, number][] = [...outline, outline[0]].map(([x, z]) => [x, LINE_Y, z]);

  return (
    <group position={[label.x, 0, label.z]}>
      <Line points={points} color={TRACE_COLOR} lineWidth={3} transparent opacity={0.75} />
      {/* label sits outside the right-side edge, rotated to read along it,
          rather than crowding the middle or the (now removed) top edge */}
      <group position={[hw + LABEL_GAP, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Text
          position={[0, LINE_Y + 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={2.2}
          fontWeight="normal"
          letterSpacing={0.12}
          color={theme.textBright}
          anchorX="center"
          anchorY="middle"
          maxWidth={label.depth * 1.6}
          textAlign="center"
        >
          {label.text}
        </Text>
      </group>
    </group>
  );
}

export function FloorLabels({ labels }: { labels: FloorLabel[] }) {
  return (
    <group>
      {labels.map((l) => (
        <ZoneOutline key={l.id} label={l} />
      ))}
    </group>
  );
}
