import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { OrthographicCamera as ThreeOrthographicCamera } from "three";

// Wheel-driven zoom with a non-linear (eased) response: the first half of the
// scroll travel covers most of the zoom-out range quickly, then it
// deliberately slows down approaching the outer limit so the last ~10% of
// zoom-out takes noticeably more scrolling than the first ~50%. Zooming in
// eases the same curve in reverse. Replaces OrbitControls' built-in (linear)
// zoom, which is why enableZoom is off on OrbitControls.
const EASE_POWER = 3.3;
const WHEEL_SENSITIVITY = 0.0012;

function rawFromZoom(zoom: number, minZoom: number, maxZoom: number) {
  const t = (maxZoom - zoom) / (maxZoom - minZoom);
  const clampedT = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clampedT, 1 / EASE_POWER);
}

function zoomFromRaw(raw: number, minZoom: number, maxZoom: number) {
  const t = 1 - Math.pow(1 - raw, EASE_POWER);
  return maxZoom - t * (maxZoom - minZoom);
}

export function ZoomRig({ minZoom, maxZoom }: { minZoom: number; maxZoom: number }) {
  const { camera, gl } = useThree();
  const rawRef = useRef<number | null>(null);

  useEffect(() => {
    const el = gl.domElement;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const cam = camera as ThreeOrthographicCamera;
      if (rawRef.current === null) {
        rawRef.current = rawFromZoom(cam.zoom, minZoom, maxZoom);
      }
      rawRef.current = Math.min(1, Math.max(0, rawRef.current + e.deltaY * WHEEL_SENSITIVITY));
      cam.zoom = zoomFromRaw(rawRef.current, minZoom, maxZoom);
      cam.updateProjectionMatrix();
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [camera, gl, minZoom, maxZoom]);

  return null;
}
