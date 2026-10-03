import { GripVertical, MoveDown, MoveUp } from "lucide-react";
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export type SolarisReorderItem = {
  id: string;
  content: ReactNode;
  ariaLabel: string;
};

type Drag = {
  pointerId: number;
  index: number;
  lastY: number;
};

export function SolarisReorderableList({
  items,
  onMove,
  className,
}: {
  items: readonly SolarisReorderItem[];
  onMove: (fromIndex: number, toIndex: number) => void;
  className?: string;
}) {
  const drag = useRef<Drag | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const start = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, index, lastY: event.clientY };
    setDraggingIndex(index);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const delta = event.clientY - active.lastY;
    if (Math.abs(delta) < 36) return;

    const direction = delta > 0 ? 1 : -1;
    const target = Math.max(0, Math.min(items.length - 1, active.index + direction));
    if (target === active.index) return;
    onMove(active.index, target);
    active.index = target;
    active.lastY = event.clientY;
    setDraggingIndex(target);
    event.preventDefault();
  };

  const finish = () => {
    drag.current = null;
    setDraggingIndex(null);
  };

  return (
    <div data-solaris-reorder-list="" className={cn("space-y-2", className)}>
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            "flex min-h-12 items-center gap-2 rounded-xl border border-border/65 bg-surface/55 p-2",
            draggingIndex === index && "scale-[1.015] shadow-lg",
          )}
        >
          <button
            type="button"
            aria-label={`Drag ${item.ariaLabel}`}
            onPointerDown={(event) => start(event, index)}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
            className="grid size-11 shrink-0 touch-none place-items-center rounded-lg text-muted-foreground active:scale-[0.96] motion-reduce:active:scale-100"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">{item.content}</div>

          <div className="flex shrink-0 gap-1" aria-label={`Move ${item.ariaLabel}`}>
            <button
              type="button"
              disabled={index === 0}
              aria-label={`Move ${item.ariaLabel} up`}
              onClick={() => onMove(index, index - 1)}
              className="grid size-11 place-items-center rounded-lg disabled:opacity-35"
            >
              <MoveUp className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={index === items.length - 1}
              aria-label={`Move ${item.ariaLabel} down`}
              onClick={() => onMove(index, index + 1)}
              className="grid size-11 place-items-center rounded-lg disabled:opacity-35"
            >
              <MoveDown className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
