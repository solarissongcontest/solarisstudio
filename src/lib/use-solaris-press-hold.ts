import { useCallback, useEffect, useRef, useState } from "react";

export const SOLARIS_HOLD_DELAY_MS = 360;
export const SOLARIS_HOLD_MOVEMENT_TOLERANCE = 8;

export function holdMovementExceeded(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  tolerance = SOLARIS_HOLD_MOVEMENT_TOLERANCE,
) {
  return Math.hypot(currentX - startX, currentY - startY) > tolerance;
}

type HoldSession = {
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
};

export function useSolarisPressHold({
  delayMs = SOLARIS_HOLD_DELAY_MS,
  movementTolerance = SOLARIS_HOLD_MOVEMENT_TOLERANCE,
}: {
  delayMs?: number;
  movementTolerance?: number;
} = {}) {
  const [held, setHeld] = useState(false);
  const session = useRef<HoldSession | null>(null);

  const disposeSession = useCallback(() => {
    const active = session.current;
    if (active && typeof window !== "undefined") window.clearTimeout(active.timer);
    session.current = null;
  }, []);

  const end = useCallback((pointerId?: number) => {
    const active = session.current;
    if (pointerId !== undefined && active?.pointerId !== pointerId) return;
    disposeSession();
    setHeld(false);
  }, [disposeSession]);

  const begin = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      end();
      if (typeof window === "undefined") return;
      const timer = window.setTimeout(() => {
        const active = session.current;
        if (!active || active.pointerId !== pointerId) return;
        setHeld(true);
      }, delayMs);
      session.current = {
        pointerId,
        startX: clientX,
        startY: clientY,
        timer,
      };
    },
    [delayMs, end],
  );

  const move = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const active = session.current;
      if (!active || active.pointerId !== pointerId) return;
      if (
        holdMovementExceeded(
          active.startX,
          active.startY,
          clientX,
          clientY,
          movementTolerance,
        )
      ) {
        end(pointerId);
      }
    },
    [end, movementTolerance],
  );

  // Unmount teardown is imperative only. Calling a React state setter from an
  // effect cleanup can race React's development mount/unmount probe and produce
  // a pre-mount update warning. The component is disappearing anyway, so only
  // the browser timer/session resource needs cleanup here.
  useEffect(() => () => disposeSession(), [disposeSession]);

  return { held, begin, move, end };
}
