import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Country } from "@/lib/data";
import {
  buildV3ResultsProjection,
  type V3ResultMode,
  type V3ResultProjectionInput,
} from "@/lib/v3-results";
import { V3Screen, V3ScreenHeader, V3Section, V3Surface } from "./V3Foundation";
import { V3ScoreboardPresentation } from "./V3ScoreboardPresentation";

export function V3ResultsScreen({
  input,
  countries,
  hideSpoilers,
}: {
  input: V3ResultProjectionInput;
  countries: ReadonlyMap<string, Country>;
  hideSpoilers: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [selectedMode, setSelectedMode] = useState<V3ResultMode>("combined");
  const projection = buildV3ResultsProjection({
    ...input,
    disclosure: hideSpoilers && !revealed ? "withheld" : "revealed",
  });
  const mode = projection.tabs.includes(selectedMode) ? selectedMode : "combined";

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
              onClick={() => setRevealed(true)}
              className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
            >
              Reveal official result
            </button>
          </V3Surface>
        ) : (
          <>
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
                        onClick={() => setSelectedMode(tab)}
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

            {projection.yourResult ? (
              <V3Section title="Your result">
                <V3Surface level="raised" className="p-4" data-v3-results-personal-context="">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{projection.yourResult.countryName}</p>
                      <p className="mt-1 text-xs text-[var(--v3-text-secondary)]">
                        Your delegation in this published result
                      </p>
                    </div>
                    <p className="text-lg font-bold tabular-nums">
                      #{projection.yourResult.rank} · {projection.yourResult.points} points
                    </p>
                  </div>
                  {projection.tabs.length > 1 ? (
                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--v3-border-subtle)] pt-3 text-xs">
                      {projection.yourResult.juryPoints != null ? (
                        <div>
                          <dt className="text-[var(--v3-text-tertiary)]">Jury</dt>
                          <dd className="mt-1 font-semibold tabular-nums">{projection.yourResult.juryPoints} points</dd>
                        </div>
                      ) : null}
                      {projection.yourResult.televotePoints != null ? (
                        <div>
                          <dt className="text-[var(--v3-text-tertiary)]">Televote</dt>
                          <dd className="mt-1 font-semibold tabular-nums">{projection.yourResult.televotePoints} points</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </V3Surface>
              </V3Section>
            ) : null}

            <V3Section title="Explore this result">
              <nav aria-label="Explore this result" className="grid gap-2">
                {projection.exploreThisResult.map((link) => (
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
