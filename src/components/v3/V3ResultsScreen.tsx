import { Link } from "@tanstack/react-router";
import { ChevronRight, Eye, LockKeyhole } from "lucide-react";
import { useState } from "react";
import type { Country } from "@/lib/data";
import {
  buildV3ResultsProjection,
  type V3ResultMode,
  type V3ResultProjectionInput,
  type V3ResultShowOption,
} from "@/lib/v3-results";
import { V3Screen, V3Section } from "./V3Foundation";
import { V3ScoreboardPresentation } from "./V3ScoreboardPresentation";

function ResultLinks({ links }: { links: readonly { key: string; label: string; href: string }[] }) {
  return (
    <nav className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
      {links.map((link) => (
        <Link
          key={link.key}
          to={link.href as any}
          className="flex min-h-12 items-center gap-3 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <span className="min-w-0 flex-1">{link.label}</span>
          <ChevronRight className="size-4 shrink-0 text-white/24" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

export function V3ResultsScreen({
  input,
  countries,
  hideSpoilers,
  options = [],
  changingResult = false,
  onResultChange,
}: {
  input: V3ResultProjectionInput;
  countries: ReadonlyMap<string, Country>;
  hideSpoilers: boolean;
  options?: readonly V3ResultShowOption[];
  changingResult?: boolean;
  onResultChange?: (showId: string) => void;
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
        <header className="border-b border-white/[0.08] pb-5" data-v3-results-header="">
          <p className="v3-kicker">Results</p>
          <h1 className="mt-2 max-w-[18ch] text-[clamp(1.9rem,8vw,2.7rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
            Official results
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/48">
            {input.showId ? `${input.editionName} · ${input.showName}` : "Published outcomes and their story."}
          </p>
        </header>

        {options.length > 1 && onResultChange ? (
          <V3Section title="Result archive" meta={`${options.length} published finals`}>
            <label htmlFor="v3-results-history" className="block text-xs font-semibold text-white/50">Official result</label>
            <select
              id="v3-results-history"
              value={input.showId}
              onChange={(event) => onResultChange(event.target.value)}
              disabled={changingResult}
              className="mt-2 min-h-11 w-full border-x-0 border-y border-white/[0.1] bg-transparent px-0 text-sm disabled:opacity-60"
              data-v3-results-history=""
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>{option.editionName} · {option.name}</option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-white/43">Only canonically published final results appear here.</p>
          </V3Section>
        ) : null}

        {projection.status === "unpublished" ? (
          <section className="mt-6 border-y border-white/[0.08] py-5">
            <LockKeyhole className="size-5 text-white/42" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">No public result yet</h2>
            <p className="mt-2 text-sm text-white/48">The official ranking will appear when it is published.</p>
            <Link to="/editions" className="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--v3-accent-strong)]">Explore editions</Link>
          </section>
        ) : projection.status === "spoiler-protected" ? (
          <section className="mt-6 border-y border-white/[0.08] py-5">
            <Eye className="size-5 text-white/42" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">Results are available</h2>
            <p className="mt-2 text-sm text-white/48">Rankings, points and analysis stay hidden until you choose to reveal this result.</p>
            <button type="button" onClick={() => setRevealed(true)} className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]">Reveal official result</button>
          </section>
        ) : (
          <>
            {projection.yourResult ? (
              <V3Section title="Your delegation">
                <div className="flex items-center gap-4 border-y border-white/[0.08] py-4" data-v3-your-result="">
                  <div className="w-12 shrink-0 text-2xl font-bold tabular-nums tracking-[-0.04em]">#{projection.yourResult.rank}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{projection.yourResult.countryName}</p>
                    <p className="mt-1 text-sm text-white/48">{projection.yourResult.points} points · official combined result</p>
                  </div>
                </div>
              </V3Section>
            ) : null}

            <V3Section title="Official result">
              {projection.officialResult.rows.length ? (
                <>
                  <div className="mb-4 grid grid-cols-3 rounded-xl bg-white/[0.035] p-1" role="group" aria-label="Published points view" data-v3-results-mode-control="">
                    {projection.tabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        aria-pressed={mode === tab}
                        onClick={() => setSelectedMode(tab)}
                        className="min-h-10 rounded-lg px-2 text-sm text-white/55 aria-pressed:bg-white/[0.09] aria-pressed:text-white"
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
                    <div className="overflow-x-auto border-y border-white/[0.08]">
                      <table className="w-full text-sm">
                        <caption className="py-3 text-left text-white/45">Published {mode} points · countries in official combined order</caption>
                        <thead>
                          <tr><th scope="col" className="py-2 text-left">Country</th><th scope="col" className="py-2 text-right">Points</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {projection.officialResult.rows.map((row) => (
                            <tr key={row.countryId}>
                              <th scope="row" className="py-3 text-left font-medium">{row.countryName}</th>
                              <td className="py-3 text-right tabular-nums">{(mode === "jury" ? row.juryPoints : row.televotePoints) ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p role="status">The published ranking is not available yet.</p>
              )}
              <Link to="/shows/$showId" params={{ showId: input.showId }} search={{ from: "results" }} className="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--v3-accent-strong)]">Open full official result</Link>
            </V3Section>

            <V3Section title="Explore this result">
              <ResultLinks links={projection.exploreThisResult} />
            </V3Section>
            <V3Section title="More analysis">
              <ResultLinks links={projection.moreAnalysis} />
            </V3Section>
          </>
        )}
      </div>
    </V3Screen>
  );
}
