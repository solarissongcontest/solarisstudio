import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { resolveGestureOwner } from "@/lib/interaction-physics";
import { cn } from "@/lib/utils";

export type SolarisSwipeAction = {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

type SwipeState = {
  pointerId: number;
  startX: number;
  startY: number;
  owner: "none" | "horizontal" | "vertical";
};

export function SolarisSwipeActionRow({
  children,
  actions,
  className,
  showFallbackActions = true,
}: {
  children: ReactNode;
  actions: readonly SolarisSwipeAction[];
  className?: string;
  showFallbackActions?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const gesture = useRef<SwipeState | null>(null);
  const actionWidth = Math.max(72, actions.length * 76);
  const maxReveal = Math.min(240, actionWidth);

  const reset = useCallback(() => {
    gesture.current = null;
    setOffset(open ? -maxReveal : 0);
  }, [maxReveal, open]);

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      owner: "none",
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;

    if (active.owner === "none") active.owner = resolveGestureOwner(dx, dy);
    if (active.owner === "vertical" || active.owner === "none") return;

    event.preventDefault();
    const base = open ? -maxReveal : 0;
    setOffset(Math.max(-maxReveal, Math.min(0, base + dx)));
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const shouldOpen = active.owner === "horizontal" && offset < -maxReveal * 0.42;
    setOpen(shouldOpen);
    setOffset(shouldOpen ? -maxReveal : 0);
    gesture.current = null;
  };

  return (
    <div
      data-solaris-swipe-row=""
      className={cn("relative overflow-hidden rounded-xl", className)}
    >
      <div
        aria-label="Row actions"
        aria-hidden={!open}
        className="absolute inset-y-0 right-0 flex items-stretch justify-end"
        style={{ width: maxReveal }}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={!open}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              action.onSelect();
              setOpen(false);
              setOffset(0);
            }}
            className={cn(
              "min-w-[72px] px-3 text-xs font-bold",
              action.destructive
                ? "bg-destructive text-destructive-foreground"
                : "bg-surface-strong text-foreground",
            )}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={reset}
        onLostPointerCapture={reset}
        className="relative z-[1] touch-pan-y bg-background transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: `translate3d(${offset}px,0,0)` }}
      >
        {children}
      </div>

      {actions.length && showFallbackActions ? (
        <div className="relative z-[2] flex justify-end gap-1 border-t border-border/50 bg-background/90 p-1">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              const next = !open;
              setOpen(next);
              setOffset(next ? -maxReveal : 0);
            }}
            className="min-h-9 rounded-lg px-3 text-xs font-semibold text-muted-foreground"
          >
            {open ? "Hide actions" : "Actions"}
          </button>
        </div>
      ) : null}
    </div>
  );
}