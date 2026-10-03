import {
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import {
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  SheetClose,
  SheetContent,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type SolarisSheetDetent = "collapsed" | "medium" | "expanded";

const DETENT_HEIGHT: Record<SolarisSheetDetent, string> = {
  collapsed: "42dvh",
  medium: "68dvh",
  expanded: "92dvh",
};

type DragState = {
  pointerId: number;
  startY: number;
};

export function SolarisDraggableSheetContent({
  detent: controlledDetent,
  onDetentChange,
  className,
  children,
  ...props
}: ComponentProps<typeof SheetContent> & {
  detent?: SolarisSheetDetent;
  onDetentChange?: (detent: SolarisSheetDetent) => void;
}) {
  const [internalDetent, setInternalDetent] = useState<SolarisSheetDetent>("medium");
  const [dragOffset, setDragOffset] = useState(0);
  const drag = useRef<DragState | null>(null);
  const detent = controlledDetent ?? internalDetent;

  const setDetent = (next: SolarisSheetDetent) => {
    if (controlledDetent === undefined) setInternalDetent(next);
    onDetentChange?.(next);
  };

  const start = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, startY: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const delta = event.clientY - active.startY;
    setDragOffset(Math.max(-70, Math.min(140, delta)));
    event.preventDefault();
  };

  const finish = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;

    if (dragOffset < -42) {
      setDetent(detent === "collapsed" ? "medium" : "expanded");
    } else if (dragOffset > 42) {
      setDetent(detent === "expanded" ? "medium" : "collapsed");
    }
    drag.current = null;
    setDragOffset(0);
  };

  return (
    <SheetContent
      {...props}
      side="bottom"
      showCloseButton={false}
      data-solaris-draggable-sheet=""
      data-detent={detent}
      className={cn(
        "!inset-x-0 !bottom-0 !h-auto !max-w-none !rounded-t-[1.5rem] !p-0",
        "transition-[height,transform] duration-200 ease-out motion-reduce:transition-none",
        className,
      )}
      style={{
        ...props.style,
        height: DETENT_HEIGHT[detent],
        transform: `translate3d(0,${Math.max(0, dragOffset)}px,0)`,
      }}
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/92 px-2 py-1.5 backdrop-blur-xl">
        <button
          type="button"
          aria-label="Resize sheet"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={() => {
            drag.current = null;
            setDragOffset(0);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setDragOffset(0);
          }}
          className="mx-auto flex min-h-11 min-w-24 touch-none items-center justify-center"
        >
          <span className="h-1.5 w-12 rounded-full bg-muted-foreground/35" aria-hidden="true" />
        </button>

        <button
          type="button"
          disabled={detent === "expanded"}
          onClick={() => setDetent(detent === "collapsed" ? "medium" : "expanded")}
          className="grid size-11 place-items-center rounded-lg disabled:opacity-35"
          aria-label="Expand sheet"
        >
          <ChevronUp className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={detent === "collapsed"}
          onClick={() => setDetent(detent === "expanded" ? "medium" : "collapsed")}
          className="grid size-11 place-items-center rounded-lg disabled:opacity-35"
          aria-label="Collapse sheet"
        >
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>
        <SheetClose asChild>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-lg"
            aria-label="Close sheet"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </SheetClose>
      </div>
      <div className="h-[calc(100%-3.5rem)] overflow-y-auto overscroll-contain">
        {children}
      </div>
    </SheetContent>
  );
}
