"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FlagChip } from "./FlagChip";
import type { Country } from "@/lib/data";
import type { Standing } from "@/lib/analysis";
import { cn } from "@/lib/utils";

export function Scoreboard({
  standings,
  countries,
  highlight,
  awarded,
  compact = false,
  showSplit = true,
}: {
  standings: Standing[];
  countries: Map<string, Country>;
  highlight?: string | null;
  awarded?: Record<string, number>;
  compact?: boolean;
  showSplit?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <ol className="space-y-1.5">
      {standings.map((row) => {
        const c = countries.get(row.countryId);
        if (!c) return null;
        const gain = awarded?.[row.countryId];
        const isTwelve = gain === 12;
        return (
          <motion.li
            key={row.countryId}
            layout={!reduceMotion}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
            className={cn(
              "glass relative flex items-center gap-3 overflow-hidden px-3",
              compact ? "py-1.5" : "py-2.5",
              highlight === row.countryId && "glow-ring ring-1 ring-primary",
              row.rank === 1 && "ring-1 ring-[var(--gold)]/50",
            )}
            style={gain ? { background: `color-mix(in oklab, ${c.accent_color} 18%, transparent)` } : undefined}
          >
            <span
              className={cn(
                "numeric w-7 text-center text-sm font-semibold",
                row.rank === 1 ? "text-gold-grad" : "text-muted-foreground",
              )}
            >
              {row.rank}
            </span>
            <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size={compact ? "sm" : "md"} />
            <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>

            {showSplit && !compact && (
              <span className="hidden gap-2 text-[11px] text-muted-foreground sm:flex">
                <span className="numeric rounded bg-surface px-1.5 py-0.5 text-[var(--jury)]">
                  J {row.jury}
                </span>
                <span className="numeric rounded bg-surface px-1.5 py-0.5 text-[var(--televote)]">
                  T {row.televote}
                </span>
              </span>
            )}

            <AnimatePresence>
              {gain ? (
                <motion.span
                  key={`gain-${gain}`}
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { scale: isTwelve ? 0.92 : 0.96, opacity: 0, x: isTwelve ? 12 : 8 }
                  }
                  animate={{ scale: 1, opacity: 1, x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                  transition={
                    reduceMotion
                      ? { duration: 0.14, ease: "easeOut" }
                      : isTwelve
                        ? { type: "spring", stiffness: 420, damping: 22 }
                        : { type: "spring", stiffness: 390, damping: 28 }
                  }
                  className={cn(
                    "numeric grid place-items-center rounded-lg px-2 py-1 text-sm font-bold",
                    isTwelve
                      ? "bg-aurora glow-ring min-w-12 text-lg text-primary-foreground"
                      : "bg-surface-strong text-foreground",
                  )}
                >
                  +{gain}
                </motion.span>
              ) : null}
            </AnimatePresence>

            <motion.span layout={!reduceMotion} className="numeric w-14 text-right text-lg font-bold">
              {row.total}
            </motion.span>
          </motion.li>
        );
      })}
    </ol>
  );
}
