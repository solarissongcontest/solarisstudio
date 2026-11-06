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
  engaged: boolean;
};

/**
 * Hold intent can be cancelled by finger movement only until the timer
 * engages. Once engaged, the gesture belongs to direct lens manipulation
 * until its matching pointer ends/cancels.
 */
export function shouldCancelPendingHoldOnMove(
  engaged: boolean,
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  tolerance = SOLARIS_HOLD_MOVEMENT_TOLERANCE,
) {
  return !engaged && holdMovementExceeded(startX, startY, clientX, clientY, tolerance);
}

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
        active.engaged = true;
        setHeld(true);
      }, delayMs);
      session.current = {
        pointerId,
        startX: clientX,
        startY: clientY,
        timer,
        engaged: false,
      };
    },
    [delayMs, end],
  );

  const move = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const active = session.current;
      if (!active || active.pointerId !== pointerId) return;
      if (
        shouldCancelPendingHoldOnMove(
          active.engaged,
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

  const isEngaged = useCallback(
    (pointerId: number) => {
      const active = session.current;
      return Boolean(active && active.pointerId === pointerId && active.engaged);
    },
    [],
  );

  useEffect(() => () => disposeSession(), [disposeSession]);

  return { held, begin, move, end, isEngaged };
}
