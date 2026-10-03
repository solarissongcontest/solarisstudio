import { useCallback, useRef, useState } from "react";

import {
  resolveGestureOwner,
  type SolarisGestureOwner,
} from "@/lib/interaction-physics";

type GestureSession = {
  pointerId: number;
  startX: number;
  startY: number;
  owner: SolarisGestureOwner;
};

export function useSolarisGestureCoordinator(threshold = 7) {
  const session = useRef<GestureSession | null>(null);
  const [owner, setOwner] = useState<SolarisGestureOwner>("none");

  const begin = useCallback((pointerId: number, clientX: number, clientY: number) => {
    session.current = { pointerId, startX: clientX, startY: clientY, owner: "none" };
    setOwner("none");
  }, []);

  const update = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const current = session.current;
      if (!current || current.pointerId !== pointerId) return "none" as SolarisGestureOwner;
      if (current.owner !== "none") return current.owner;

      const next = resolveGestureOwner(
        clientX - current.startX,
        clientY - current.startY,
        threshold,
      );
      if (next !== "none") {
        current.owner = next;
        setOwner(next);
      }
      return next;
    },
    [threshold],
  );

  const cancel = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && session.current?.pointerId !== pointerId) return;
    session.current = null;
    setOwner("none");
  }, []);

  return { owner, begin, update, cancel };
}
