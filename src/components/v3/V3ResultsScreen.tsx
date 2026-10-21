import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Country } from "@/lib/data";
import {
  buildV3ResultsProjection,
  type V3ResultMode,
  type V3ResultProjectionInput,
  type V3ResultShowOption,
} from "@/lib/v3-results";
import { V3Screen, V3ScreenHeader, V3Section, V3Surface } from "./V3Foundation";
import { V3ScoreboardPresentation } from "./V3ScoreboardPresentation";

function resultToolHref(input: {
  key: string;
  href: string;
  showId: string;
}) {
  if (input.key === "scorecharts" && input.showId) {
    return `/shows/${encodeURIComponent(input.showId)}?tab=matrix&from=results`;
  }
  return input.href;
}

export function V3ResultsScreen({
  input,
  countries,
  hideSpoilers,
  options = [],
  changingResult = false,
  onResultChange,
  selectedMode: controlledMode,
  onModeChange,
  revealed: controlledRevealed,
  onReveal,
}: {
  input: V3ResultProjectionInput;
  countries: ReadonlyMap<string, Country>;
  hideSpoilers: boolean;
  options?: readonly V3ResultShowOption[];
  changingResult?: boolean;
  onResultChange?: (showId: string) => void;
  selectedMode?: V3ResultMode;
  onModeChange?: (mode: V3ResultMode) => void;
  revealed?: boolean;
  onReveal?: () => void;
}) {
  // Standalone callers may keep disclosure locally. The routed Results root
  // controls it by canonical show id so URL canonicalization can refetch the
  // same result without forgetting a deliberate reveal. A different show id
  // still starts protected.
  const [localRevealed, setLocalRevealed] = useState(false);
  const [localMode, setLocalMode] = useState<V3ResultMode>("combined");
  const revealed = controlledRevealed ?? localRevealed;
  const projection = buildV3ResultsProjection({
    ...input,
    disclosure: hideSpoilers && !revealed ? "withheld" : "revealed",
  });
  const requestedMode = controlledMode ?? localMode;
  const mode = projection.tabs.includes(requestedMode) ? requestedMode : "combined";
  const changeMode = (nextMode: V3ResultMode) => {
    if (!projection.tabs.includes(nextMode)) return;
    if (onModeChange) onModeChange(nextMode);
    else setLocalMode(nextMode);
  };
  const revealResult = () => {
    if (onReveal) onReveal();
    else setLocalRevealed(true);
  };

  return (
    <V3Screen>
      <div data-v3-results-root="" data-v3-results-state={projection.status}>
        <V3ScreenHeader
          kicker="Results"
          title="Official results"
          description={
            input.showId
              ? `${input.editionName} · ${input.showName}`
              : "Published outcomes and their story."
          }
        />

        {options.length > 1 && onResultChange ? (
          <V3Section title="Result archive" meta={`${options.length} published finals`}>
            <V3Surface className="p-4">
              <label htmlFor="v3-results-history" className="text-xs font-semibold text-[var(--v3-text-secondary)]">
                Official result
              </label>
              <select
                id="v3-results-history"
                value={input.showId}
                onChange={(event) => onResultChange(event.target.value)}
                disabled={changingResult}
                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--v3-border)] bg-[var(--v3-bg-base)] px-3 text-sm disabled:opacity-60"
                data-v3-results-history=""
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.editionName} · {option.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Only canonically published final results appear here. Selecting a result never changes its publication state.
              </p>
            </V3Surface>
          </V3Section>
        ) : null}

        {projection.status === "unpublished" ? (
          <V3Surface className="p-5">
            <h2 className="font-semibold">No public result yet</h2>
            <p className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              The official ranking will appear when it is published.
            </p>
            <Link to="/editions" className="mt-4 inline-flex min-h-11 items-center underline">
              Explore editions
            </Link>
          </V3Surface>
        ) : projection.status === "spoiler-protected" ? (
          <V3Surface className="p-5">
            <h2 className="font-semibold">Results are available</h2>
            <p className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Rankings, points and analysis stay hidden until you choose to reveal this result.
            </p>
            <button
              type="button"
              onClick={revealResult}
              className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
            >
              Reveal official result
            </button>
          </V3Surface>
        ) : (
          <>
            {projection.yourResult ? (
              <V3Section title="Your delegation">
                <V3Surface level="raised" className="p-4" data-v3-your-result="">
                  <div className="flex items-center gap-4">
                    <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.04] text-xl font-black tabular-nums">
                      #{projection.yourResult.rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold">
                        {projection.yourResult.countryName}
                      </p>
                      <p className="mt-1 text-sm text-[var(--v3-text-secondary)]">
                        {projection.yourResult.points} points · official combined result
                      </p>
                    </div>
                  </div>
                </V3Surface>
              </V3Section>
            ) : null}

            <V3Section title="Official result">
              {projection.officialResult.rows.length ? (
                <>
                  <div
                    className="mb-4 grid grid-cols-3 gap-2"
                    role="group"
                    aria-label="Published points view"
                  >
                    {projection.tabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        aria-pressed={mode === tab}
                        onClick={() => changeMode(tab)}
                        className="min-h-11 rounded-xl border border-[var(--v3-border)] px-2 text-sm aria-pressed:bg-white/10"
                      >
                        {tab === "combined" ? "Combined" : tab === "jury" ? "Jury" : "Televote"}
                      </button>
                    ))}
                  </div>
                  {mode === "combined" ? (
                    <V3ScoreboardPresentation
                      countries={countries}
                      standings={projection.officialResult.rows.map((row) => ({
                        countryId: row.countryId,
                        rank: row.rank,
                        total: row.points,
                        jury: row.juryPoints ?? 0,
                        televote: row.televotePoints ?? 0,
                        topPoints: 0,
                      }))}
                    />
                  ) : (
                    <V3Surface className="overflow-x-auto p-4">
                      <table className="w-full text-sm">
                        <caption className="mb-3 text-left text-[var(--v3-text-secondary)]">
                          Published {mode} points · countries in official combined order
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col" className="py-2 text-left">
                              Country
                            </th>
                            <th scope="col" className="py-2 text-right">
                              Points
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {projection.officialResult.rows.map((row) => (
                            <tr key={row.countryId}>
                              <th scope="row" className="py-3 text-left font-medium">
                                {row.countryName}
                              </th>
                              <td className="py-3 text-right tabular-nums">
                                {(mode === "jury" ? row.juryPoints : row.televotePoints) ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </V3Surface>
                  )}
                </>
              ) : (
                <p role="status">The published ranking is not available yet.</p>
              )}
              <Link
                to="/shows/$showId"
                params={{ showId: input.showId }}
                search={{ from: "results" }}
                className="mt-4 inline-flex min-h-11 items-center underline"
              >
                Open full official result
              </Link>
            </V3Section>

            <V3Section title="Explore this result">
              <nav aria-label="Explore this result" className="grid gap-2">
                {projection.exploreThisResult.map((link) => (
                  <Link
                    key={link.key}
                    to={resultToolHref({ key: link.key, href: link.href, showId: input.showId }) as any}
                    className="flex min-h-11 items-center rounded-xl border border-[var(--v3-border-subtle)] px-4"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </V3Section>
            <V3Section title="More analysis">
              <nav aria-label="More result analysis" className="grid gap-2">
                {projection.moreAnalysis.map((link) => (
                  <Link
                    key={link.key}
                    to={link.href as any}
                    className="flex min-h-11 items-center rounded-xl border border-[var(--v3-border-subtle)] px-4"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </V3Section>
          </>
        )}
      </div>
    </V3Screen>
  );
}