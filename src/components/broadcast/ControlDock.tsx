"use client";

/**
 * Compact, movable, hideable broadcast control bar.
 *
 * Never overlaps the board by default (it floats), can be collapsed to a small
 * transport strip, hidden entirely for clean output, and remembers its position
 * and mode per browser.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BroadcastControlConfig } from "@/lib/scoreboard";

const STORAGE_KEY = "ssc:broadcast-controls";

export type ControlDockState = Pick<BroadcastControlConfig, "mode" | "position" | "cleanOutput">;

const DEFAULT_STATE: ControlDockState = {
  mode: "expanded",
  position: { x: 24, y: 24, anchor: "bottom-center" },
  cleanOutput: false,
};

export function useControlDockState(initial?: Partial<ControlDockState>) {
  const [state, setState] = useState<ControlDockState>({ ...DEFAULT_STATE, ...initial });

  // localStorage is read after hydration so SSR and first client render agree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState((s) => ({ ...s, ...(JSON.parse(raw) as ControlDockState) }));
    } catch {
      /* ignore unreadable storage */
    }
  }, []);

  const update = useCallback((patch: Partial<ControlDockState>) => {
    setState((s) => {
      const next = { ...s, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return [state, update] as const;
}

export function BroadcastControlDock({
  state,
  onChange,
  playing,
  onTogglePlay,
  onPrev,
  onNext,
  onReplay,
  onJump,
  speed,
  speeds,
  onSpeed,
  stepIndex,
  stepCount,
  stepLabel,
  extra,
}: {
  state: ControlDockState;
  onChange: (patch: Partial<ControlDockState>) => void;
  playing: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReplay: () => void;
  onJump?: (index: number) => void;
  speed: number;
  speeds: readonly number[];
  onSpeed: (s: number) => void;
  stepIndex: number;
  stepCount: number;
  stepLabel?: string;
  extra?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Keyboard transport. Ignored while typing into a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === " ") {
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key.toLowerCase() === "r") onReplay();
      else if (e.key.toLowerCase() === "h")
        onChange({ mode: state.mode === "hidden" ? "expanded" : "hidden" });
      else if (e.key.toLowerCase() === "c") onChange({ cleanOutput: !state.cleanOutput });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTogglePlay, onNext, onPrev, onReplay, onChange, state.mode, state.cleanOutput]);

  const startDrag = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const x = e.clientX - drag.current.dx;
    const y = e.clientY - drag.current.dy;
    onChange({ position: { x, y, anchor: "free" } });
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  if (state.mode === "hidden") {
    return (
      <button
        type="button"
        onClick={() => onChange({ mode: "compact" })}
        className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/80 opacity-30 backdrop-blur transition hover:opacity-100"
        aria-label="Show broadcast controls"
      >
        controls
      </button>
    );
  }

  const anchored = state.position.anchor !== "free";
  const style: React.CSSProperties = anchored
    ? { bottom: 20, left: "50%", transform: "translateX(-50%)" }
    : { left: state.position.x, top: state.position.y };

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "fixed z-50 select-none rounded-2xl border border-white/15 bg-black/55 text-white shadow-2xl backdrop-blur-xl",
        dragging && "cursor-grabbing",
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span
          onPointerDown={startDrag}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          className="mr-1 cursor-grab px-1 text-white/40"
          title="Drag to move"
        >
          ⋮⋮
        </span>

        <DockButton onClick={onPrev} label="Previous step">
          ⏮
        </DockButton>
        <DockButton onClick={onTogglePlay} label={playing ? "Pause" : "Play"} primary>
          {playing ? "⏸" : "▶"}
        </DockButton>
        <DockButton onClick={onNext} label="Next step">
          ⏭
        </DockButton>
        <DockButton onClick={onReplay} label="Replay from start">
          ↺
        </DockButton>

        <span className="numeric mx-2 text-[11px] text-white/60">
          {Math.min(stepIndex + 1, stepCount)}/{stepCount}
        </span>

        <DockButton
          onClick={() => onChange({ mode: state.mode === "compact" ? "expanded" : "compact" })}
          label={state.mode === "compact" ? "Expand controls" : "Collapse controls"}
        >
          {state.mode === "compact" ? "▴" : "▾"}
        </DockButton>
        <DockButton onClick={() => onChange({ mode: "hidden" })} label="Hide controls">
          ✕
        </DockButton>
      </div>

      {state.mode === "expanded" && (
        <div className="space-y-2 border-t border-white/10 px-3 pb-2.5 pt-2">
          {stepLabel && <p className="text-[11px] text-white/70">{stepLabel}</p>}

          <input
            type="range"
            min={0}
            max={Math.max(0, stepCount - 1)}
            value={stepIndex}
            onChange={(e) => onJump?.(Number(e.target.value))}
            className="w-full accent-white"
            aria-label="Timeline"
          />

          <div className="flex flex-wrap items-center gap-1">
            {speeds.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSpeed(s)}
                className={cn(
                  "numeric rounded px-1.5 py-0.5 text-[10px] text-white/70",
                  speed === s && "bg-white/25 text-white",
                )}
              >
                {s}×
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-[10px] text-white/70">
              <input
                type="checkbox"
                checked={state.cleanOutput}
                onChange={(e) => onChange({ cleanOutput: e.target.checked })}
              />
              Clean output
            </label>
          </div>

          {extra}

          <p className="text-[10px] text-white/40">Space play · ←/→ step · R replay · H hide · C clean</p>
        </div>
      )}
    </div>
  );
}

function DockButton({
  children,
  onClick,
  label,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-lg text-xs text-white/80 transition hover:bg-white/15",
        primary && "bg-white/20 text-white",
      )}
    >
      {children}
    </button>
  );
}
