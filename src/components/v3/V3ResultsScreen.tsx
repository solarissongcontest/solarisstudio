import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronRight,
  Eye,
  EyeOff,
  Medal,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  V3ResultMode,
  V3ResultRow,
  V3ResultsProjection,
} from "@/lib/v3-results";
import { V3Section, V3StatusChip, V3Surface } from "./V3Foundation";

function Flag({ row, large = false }: { row: V3ResultRow; large?: boolean }) {
  const size = large ? "h-12 w-[72px]" : "h-8 w-12";
  return row.flagUrl ? (
    <img
      src={row.flagUrl}
      alt=""
      className={`${size} shrink-0 rounded-lg border border-white/10 object-cover`}
      style={{ aspectRatio: "3 / 2" }}
      loading="lazy"
    />
  ) : (
    <span
      className={`${size} grid shrink-0 place-items-center rounded-lg border border-[var(--v3-border-subtle)] bg-white/[0.04] text-[0.65rem] font-black uppercase text-[var(--v3-text-secondary)]`}
      aria-hidden="true"
    >
      {row.countryName.slice(0, 2)}
    </span>
  );
}

function modeLabel(mode: V3ResultMode) {
  if (mode === "jury") return "Jury";
  if (mode === "televote") return "Televote";
  return "Combined";
}

function valueForMode(row: V3ResultRow, mode: V3ResultMode) {
  if (mode === "jury") return row.juryPoints;
  if (mode === "televote") return row.televotePoints;
  return row.points;
}

function ResultList({
  rows,
  mode,
}: {
  rows: readonly V3ResultRow[];
  mode: V3ResultMode;
}) {
  const displayed = useMemo(() => {
    if (mode === "combined") return [...rows].sort((a, b) => a.rank - b.rank);
    return [...rows].sort((a, b) => {
      const aValue = valueForMode(a, mode) ?? -1;
      const bValue = valueForMode(b, mode) ?? -1;
      return bValue - aValue || a.rank - b.rank;
    });
  }, [mode, rows]);

  return (
    <ol className="grid gap-2" aria-label={`${modeLabel(mode)} result`}>
      {displayed.map((row, index) => {
        const value = valueForMode(row, mode);
        const position = mode === "combined" ? row.rank : index + 1;
        return (
          <li
            key={row.countryId}
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.022] px-3 py-2.5"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] text-sm font-bold tabular-nums text-[var(--v3-text-secondary)]">
              {position}
            </span>
            <Flag row={row} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{row.countryName}</span>
              {row.artist || row.song ? (
                <span className="mt-0.5 block truncate text-[0.72rem] text-[var(--v3-text-tertiary)]">
                  {[row.artist, row.song].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-base font-bold tabular-nums">
                {value ?? "—"}
              </span>
              <span className="block text-[0.65rem] text-[var(--v3-text-tertiary)]">
                {value == null ? "not published" : "points"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function V3ResultsScreen({ projection }: { projection: V3ResultsProjection }) {
  const [mode, setMode] = useState<V3ResultMode>(projection.tabs[0] ?? "combined");
  const activeMode = projection.tabs.includes(mode) ? mode : projection.tabs[0] ?? "combined";
  const winner = projection.officialResult.winner;

  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-32 pt-7 sm:pt-10"
      data-solaris-v3
      data-v3-results=""
    >
      <header className="border-b border-[var(--v3-border-subtle)] pb-5">
        <p className="v3-kicker">Official results</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          Results
        </h1>
        <p className="mt-2 text-sm text-[var(--v3-text-secondary)]">
          {projection.context.editionName}
          {projection.context.showName && projection.context.showName !== "Results"
            ? ` · ${projection.context.showName}`
            : ""}
        </p>
      </header>

      {projection.status === "unpublished" ? (
        <V3Surface level="raised" className="mt-5 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/[0.045]">
              <Trophy className="size-5 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold">No official result yet</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--v3-text-secondary)]">
                The official ranking will appear here when a published show releases its results.
              </p>
            </div>
          </div>
        </V3Surface>
      ) : projection.status === "spoiler-protected" ? (
        <V3Surface level="raised" className="mt-5 overflow-hidden p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/[0.045]">
              <EyeOff className="size-5 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <V3StatusChip tone="neutral">Spoiler-free</V3StatusChip>
              <h2 className="mt-3 text-lg font-bold">Results are available</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--v3-text-secondary)]">
                Winner, ranking and score details stay hidden here until you deliberately open the published result.
              </p>
              <Link
                to="/shows/$showId"
                params={{ showId: projection.context.showId }}
                search={{ from: "results" }}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--v3-accent)] px-4 text-sm font-bold text-black"
              >
                <Eye className="size-4" aria-hidden="true" />
                Reveal official result
              </Link>
            </div>
          </div>
        </V3Surface>
      ) : (
        <>
          {winner ? (
            <V3Surface level="raised" className="mt-5 overflow-hidden p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="v3-kicker">Winner</p>
                  <div className="mt-3 flex min-w-0 items-center gap-3">
                    <Flag row={winner} large />
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl font-black tracking-[-0.035em]">
                        {winner.countryName}
                      </h2>
                      {winner.artist || winner.song ? (
                        <p className="mt-1 truncate text-xs text-[var(--v3-text-secondary)]">
                          {[winner.artist, winner.song].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.035] px-3 py-2 text-right">
                  <div className="flex items-center gap-2">
                    <Trophy className="size-4 text-[var(--v3-warning)]" aria-hidden="true" />
                    <span className="text-xl font-black tabular-nums">{winner.points}</span>
                  </div>
                  <span className="text-[0.65rem] text-[var(--v3-text-tertiary)]">points</span>
                </div>
              </div>
            </V3Surface>
          ) : null}

          {projection.yourResult ? (
            <V3Surface level="base" className="mt-3 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/[0.04]">
                  <Medal className="size-5 text-[var(--v3-accent)]" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--v3-text-tertiary)]">
                    Your delegation
                  </p>
                  <p className="mt-1 truncate text-sm font-bold">
                    {projection.yourResult.countryName}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-black tabular-nums">#{projection.yourResult.rank}</p>
                  <p className="text-[0.68rem] text-[var(--v3-text-tertiary)]">
                    {projection.yourResult.points} pts
                  </p>
                </div>
              </div>
            </V3Surface>
          ) : null}

          <V3Section title="Official ranking" className="mt-6">
            {projection.tabs.length > 1 ? (
              <div
                className="mb-3 grid grid-flow-col auto-cols-fr rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.02] p-1"
                role="tablist"
                aria-label="Result type"
              >
                {projection.tabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeMode === tab}
                    className="min-h-10 rounded-xl px-3 text-xs font-bold transition data-[active=true]:bg-white/[0.09] data-[active=true]:text-white text-[var(--v3-text-secondary)]"
                    data-active={activeMode === tab ? "true" : "false"}
                    onClick={() => setMode(tab)}
                  >
                    {modeLabel(tab)}
                  </button>
                ))}
              </div>
            ) : null}
            <ResultList rows={projection.officialResult.rows} mode={activeMode} />
          </V3Section>

          {projection.exploreThisResult.length ? (
            <V3Section title="Explore this result" className="mt-7">
              <div className="grid gap-2 sm:grid-cols-2">
                {projection.exploreThisResult.map((tool) => (
                  <Link
                    key={tool.key}
                    to={tool.href as any}
                    className="flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.022] px-4 py-3 active:scale-[0.99]"
                  >
                    <BarChart3 className="size-4 shrink-0 text-[var(--v3-accent)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tool.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-white/30" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </V3Section>
          ) : null}

          {projection.moreAnalysis.length ? (
            <details className="mt-7 rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.015] p-4">
              <summary className="cursor-pointer text-sm font-bold">More analysis</summary>
              <div className="mt-3 grid gap-2">
                {projection.moreAnalysis.map((tool) => (
                  <Link
                    key={tool.key}
                    to={tool.href as any}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-sm text-[var(--v3-text-secondary)] hover:bg-white/[0.035]"
                  >
                    <span>{tool.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-white/30" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </main>
  );
}
