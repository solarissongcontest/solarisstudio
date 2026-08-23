import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  matchVoterKey,
  resolveShowVoters,
  useAllContestEntities,
  useCountries,
  useEditions,
  useJuryVotes,
  useResults,
  useShowParticipants,
  useShows,
  useShowVoters,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import { resolveShowPublication } from "@/lib/publication";
import {
  RESULT_LAB_BLEND_MODES,
  RESULT_LAB_JURY_SCHEMES,
  RESULT_LAB_TIE_BREAKS,
  resultLabCsv,
  simulateResultLab,
  type ResultLabBlendMode,
  type ResultLabJuryScheme,
  type ResultLabTieBreak,
} from "@/lib/result-lab";

export const Route = createFileRoute("/result-lab/")({
  head: () => ({ meta: [{ title: "Result Lab — Solaris Studio" }] }),
  component: ResultLabPage,
});

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ResultLabPage() {
  const { data: editions } = useEditions();
  const [editionId, setEditionId] = useState<string>("");
  const { data: editionShows } = useShows(editionId || undefined);
  const [showId, setShowId] = useState<string>("");
  const { data: countries } = useCountries();
  const { data: entities } = useAllContestEntities();
  const { data: participants } = useShowParticipants(showId || undefined);
  const { data: results } = useResults(showId || undefined);
  const { data: juryVotes } = useJuryVotes(showId || undefined);
  const { data: voters } = useShowVoters(showId || undefined);

  const [juryWeight, setJuryWeight] = useState(50);
  const [blendMode, setBlendMode] = useState<ResultLabBlendMode>("raw");
  const [juryScheme, setJuryScheme] = useState<ResultLabJuryScheme>("original");
  const [tieBreak, setTieBreak] = useState<ResultLabTieBreak>("televote");
  const [excludedVoters, setExcludedVoters] = useState<Set<string>>(new Set());
  const [voterSearch, setVoterSearch] = useState("");

  useEffect(() => {
    if (editionId || !editions?.length) return;
    const first = editions.find((edition) => edition.published);
    if (first) setEditionId(first.id);
  }, [editionId, editions]);

  const eligibleShows = useMemo(
    () =>
      (editionShows ?? []).filter((show) => {
        const publication = resolveShowPublication(show);
        return Boolean(
          show.published &&
          publication.results &&
          publication.jury_results &&
          publication.televote_results,
        );
      }),
    [editionShows],
  );

  useEffect(() => {
    if (!eligibleShows.length) {
      if (showId) setShowId("");
      return;
    }
    if (!eligibleShows.some((show) => show.id === showId)) {
      setShowId(eligibleShows[0].id);
    }
  }, [eligibleShows, showId]);

  useEffect(() => {
    setExcludedVoters(new Set());
    setJuryWeight(50);
    setBlendMode("raw");
    setJuryScheme("original");
    setTieBreak("televote");
    setVoterSearch("");
  }, [showId]);

  const selectedEdition = (editions ?? []).find((edition) => edition.id === editionId);
  const selectedShow = eligibleShows.find((show) => show.id === showId);
  const displayMap = useMemo(
    () => entityDisplayMap(entities ?? [], countries ?? []),
    [entities, countries],
  );

  const participantIds = useMemo(
    () => [
      ...new Set((participants ?? []).map((participant) => participant.country_id).filter(Boolean)),
    ],
    [participants],
  );

  const voterOptions = useMemo(
    () => resolveShowVoters(voters, participantIds, countries ?? []),
    [voters, participantIds, countries],
  );

  const detailedVotingPublic = Boolean(
    selectedShow && resolveShowPublication(selectedShow).detailed_voting,
  );

  const labJuryVotes = useMemo(
    () =>
      (juryVotes ?? [])
        .map((vote) => ({
          voterKey: matchVoterKey(vote, voterOptions),
          recipientId: vote.receiving_country_id,
          points: vote.points,
        }))
        .filter((vote) => vote.voterKey && vote.recipientId),
    [juryVotes, voterOptions],
  );

  const officialEntries = useMemo(
    () =>
      (results ?? [])
        .filter((result) => Boolean(result.country_id))
        .map((result) => ({
          id: result.country_id,
          name: displayMap.get(result.country_id)?.name ?? "Unknown entry",
          juryPoints: result.jury_points,
          televotePoints: result.televote_points,
          officialRank: result.final_rank,
        })),
    [results, displayMap],
  );

  const simulation = useMemo(
    () =>
      simulateResultLab({
        officialEntries,
        juryVotes: detailedVotingPublic ? labJuryVotes : [],
        config: {
          juryWeight,
          televoteWeight: 100 - juryWeight,
          blendMode,
          juryScheme,
          tieBreak,
          excludedVoters,
        },
      }),
    [
      officialEntries,
      labJuryVotes,
      detailedVotingPublic,
      juryWeight,
      blendMode,
      juryScheme,
      tieBreak,
      excludedVoters,
    ],
  );

  const selectableVoters = useMemo(() => {
    const byKey = new Map(voterOptions.map((voter) => [voter.key, voter]));

    for (const vote of labJuryVotes) {
      if (byKey.has(vote.voterKey)) continue;
      const identity = vote.voterKey.startsWith("c:") ? vote.voterKey.slice(2) : "";
      const display = identity ? displayMap.get(identity) : undefined;
      byKey.set(vote.voterKey, {
        key: vote.voterKey,
        voterId: vote.voterKey.startsWith("v:") ? vote.voterKey.slice(2) : null,
        countryId: identity || null,
        name: display?.name ?? vote.voterKey,
        short_code: display?.short_code ?? null,
        flag_image: display?.flag_image ?? null,
        accent_color: display?.accent_color ?? "#8888aa",
      });
    }

    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [voterOptions, labJuryVotes, displayMap]);

  const filteredVoters = useMemo(() => {
    const query = voterSearch.trim().toLowerCase();
    return selectableVoters.filter((voter) => !query || voter.name.toLowerCase().includes(query));
  }, [selectableVoters, voterSearch]);

  const winner = simulation.rows[0];
  const biggestGainers = [...simulation.rows]
    .filter((row) => (row.rankDelta ?? 0) > 0)
    .sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0))
    .slice(0, 3);
  const biggestLosers = [...simulation.rows]
    .filter((row) => (row.rankDelta ?? 0) < 0)
    .sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0))
    .slice(0, 3);

  const toggleVoter = (key: string) => {
    setExcludedVoters((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetScenario = () => {
    setJuryWeight(50);
    setBlendMode("raw");
    setJuryScheme("original");
    setTieBreak("televote");
    setExcludedVoters(new Set());
  };

  const exportCsv = () => {
    if (!selectedShow || !simulation.rows.length) return;
    const safeName = selectedShow.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    downloadText(
      `solaris-result-lab-${safeName || "simulation"}.csv`,
      resultLabCsv(simulation.rows),
    );
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="What-if analytics"
        title="Result Lab"
        description="Rewrite a published result without touching the official scoreboard. Change the jury/televote balance, re-score jury ballots, remove juries and test tie-break rules in real time."
        actions={
          <Link
            to="/taste-dna"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm sm:w-auto"
          >
            Taste DNA →
          </Link>
        }
      />

      <div className="grid min-w-0 gap-4 sm:gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <Panel
            title="1. Pick a result"
            description="Only shows with public jury and televote totals appear"
          >
            <label
              htmlFor="result-lab-edition"
              className="block text-xs font-semibold text-muted-foreground"
            >
              Edition
            </label>
            <select
              id="result-lab-edition"
              value={editionId}
              onChange={(event) => {
                setEditionId(event.target.value);
                setShowId("");
              }}
              className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              {(editions ?? [])
                .filter((edition) => edition.published)
                .map((edition) => (
                  <option key={edition.id} value={edition.id}>
                    {editionLabel(edition)}
                  </option>
                ))}
            </select>

            <label
              htmlFor="result-lab-show"
              className="mt-4 block text-xs font-semibold text-muted-foreground"
            >
              Show
            </label>
            <select
              id="result-lab-show"
              value={showId}
              onChange={(event) => setShowId(event.target.value)}
              disabled={!eligibleShows.length}
              className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
            >
              {!eligibleShows.length && <option value="">No eligible published show</option>}
              {eligibleShows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.name}
                </option>
              ))}
            </select>

            {!eligibleShows.length && selectedEdition && (
              <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">
                This edition does not have a fully public jury and televote result available for
                simulation yet.
              </p>
            )}
          </Panel>

          <Panel title="2. Voting balance" description="The two channels always add up to 100%">
            <div className="flex min-w-0 items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Jury
                </p>
                <p className="font-display text-2xl font-semibold">{juryWeight}%</p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Televote
                </p>
                <p className="font-display text-2xl font-semibold">{100 - juryWeight}%</p>
              </div>
            </div>
            <input
              aria-label="Jury voting weight"
              type="range"
              min={0}
              max={100}
              step={5}
              value={juryWeight}
              onChange={(event) => setJuryWeight(Number(event.target.value))}
              className="mt-4 block w-full min-w-0"
            />
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                [100, "Jury only"],
                [50, "50 / 50"],
                [0, "Tele only"],
              ].map(([value, label]) => (
                <button
                  key={String(label)}
                  type="button"
                  onClick={() => setJuryWeight(Number(value))}
                  className="min-h-10 min-w-0 rounded-xl border border-border bg-surface px-2 text-xs font-semibold"
                >
                  {label}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="3. Calculation model">
            <label className="block text-xs font-semibold text-muted-foreground">
              Blend method
            </label>
            <select
              value={blendMode}
              onChange={(event) => setBlendMode(event.target.value as ResultLabBlendMode)}
              className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              {RESULT_LAB_BLEND_MODES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
              {RESULT_LAB_BLEND_MODES.find(([value]) => value === blendMode)?.[2]}
            </p>

            <label className="mt-4 block text-xs font-semibold text-muted-foreground">
              Jury scoring
            </label>
            <select
              value={juryScheme}
              onChange={(event) => setJuryScheme(event.target.value as ResultLabJuryScheme)}
              disabled={!detailedVotingPublic || !labJuryVotes.length}
              className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
            >
              {RESULT_LAB_JURY_SCHEMES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
              {detailedVotingPublic && labJuryVotes.length
                ? RESULT_LAB_JURY_SCHEMES.find(([value]) => value === juryScheme)?.[2]
                : "Alternative jury scoring needs detailed voting to be public."}
            </p>

            <label className="mt-4 block text-xs font-semibold text-muted-foreground">
              Tie-break
            </label>
            <select
              value={tieBreak}
              onChange={(event) => setTieBreak(event.target.value as ResultLabTieBreak)}
              className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              {RESULT_LAB_TIE_BREAKS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Panel>

          <Panel
            title="4. Jury filter"
            description={
              detailedVotingPublic
                ? `${simulation.includedVoterCount} of ${simulation.availableVoterCount} juries included`
                : "Detailed ballots are not public for this show"
            }
          >
            {detailedVotingPublic && selectableVoters.length ? (
              <>
                <input
                  value={voterSearch}
                  onChange={(event) => setVoterSearch(event.target.value)}
                  placeholder="Search juries…"
                  className="min-h-10 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
                <div className="mt-3 max-h-64 min-w-0 space-y-1 overflow-y-auto pr-1">
                  {filteredVoters.map((voter) => {
                    const included = !excludedVoters.has(voter.key);
                    return (
                      <label
                        key={voter.key}
                        className="flex min-h-10 min-w-0 items-center gap-2 rounded-xl bg-surface px-3 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => toggleVoter(voter.key)}
                          className="shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate">{voter.name}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setExcludedVoters(new Set())}
                    className="min-h-10 min-w-0 rounded-xl border border-border bg-surface px-2 text-xs font-semibold"
                  >
                    Include all
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExcludedVoters(new Set(selectableVoters.map((voter) => voter.key)))
                    }
                    className="min-h-10 min-w-0 rounded-xl border border-border bg-surface px-2 text-xs font-semibold"
                  >
                    Remove all
                  </button>
                </div>
              </>
            ) : (
              <p className="break-words text-xs leading-relaxed text-muted-foreground">
                Result Lab can still change jury/televote weighting from public totals. Removing
                individual juries becomes available when detailed voting is published.
              </p>
            )}
          </Panel>

          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={resetScenario}
              className="min-h-11 min-w-0 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!simulation.rows.length}
              className="min-h-11 min-w-0 rounded-xl border border-border bg-surface px-3 text-sm font-semibold disabled:opacity-60"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-5">
          {winner ? (
            <Panel
              title="Simulated winner"
              description={`${selectedShow?.name ?? "Selected show"} · ${juryWeight}/${100 - juryWeight} jury/televote`}
            >
              <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                {(() => {
                  const display = displayMap.get(winner.id);
                  return display ? (
                    <FlagChip
                      code={display.short_code}
                      color={display.accent_color}
                      image={display.flag_image}
                      size="lg"
                    />
                  ) : null;
                })()}
                <div className="min-w-0 max-w-full">
                  <p className="break-words font-display text-xl font-semibold sm:text-2xl">
                    {winner.name}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {winner.simulatedScore.toFixed(blendMode === "raw" ? 1 : 2)} simulated score
                    {winner.officialRank != null && ` · officially #${winner.officialRank}`}
                  </p>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel title="Result Lab">
              <p className="break-words text-sm text-muted-foreground">
                Choose a published show with jury and televote results to start.
              </p>
            </Panel>
          )}

          {simulation.rows.length > 0 && (
            <Panel
              title="Biggest changes"
              description="Movement compared with the official ranking"
            >
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                <div className="min-w-0 rounded-xl bg-surface p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                    Gainers
                  </p>
                  <div className="mt-2 min-w-0 space-y-2">
                    {biggestGainers.length ? (
                      biggestGainers.map((row) => (
                        <div
                          key={row.id}
                          className="flex min-w-0 items-center justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">{row.name}</span>
                          <strong className="shrink-0">+{row.rankDelta}</strong>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Nobody moves up.</p>
                    )}
                  </div>
                </div>
                <div className="min-w-0 rounded-xl bg-surface p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                    Losers
                  </p>
                  <div className="mt-2 min-w-0 space-y-2">
                    {biggestLosers.length ? (
                      biggestLosers.map((row) => (
                        <div
                          key={row.id}
                          className="flex min-w-0 items-center justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">{row.name}</span>
                          <strong className="shrink-0">{row.rankDelta}</strong>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Nobody moves down.</p>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {simulation.rows.length > 0 && (
            <Panel title="Recalculated scoreboard" description="Official data stays untouched">
              <div className="space-y-2 sm:hidden">
                {simulation.rows.map((row) => {
                  const display = displayMap.get(row.id);
                  return (
                    <div key={row.id} className="min-w-0 rounded-xl bg-surface p-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-7 shrink-0 font-display text-lg font-semibold">
                          {row.simulatedRank}
                        </span>
                        {display && (
                          <FlagChip
                            code={display.short_code}
                            color={display.accent_color}
                            image={display.flag_image}
                            size="sm"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {row.name}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">
                          {row.rankDelta == null
                            ? ""
                            : row.rankDelta > 0
                              ? `+${row.rankDelta}`
                              : row.rankDelta}
                        </span>
                      </div>
                      <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div className="min-w-0">
                          <span className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                            Jury
                          </span>
                          <strong className="tabular-nums">{row.simulatedJuryPoints}</strong>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                            Televote
                          </span>
                          <strong className="tabular-nums">{row.simulatedTelevotePoints}</strong>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                            Score
                          </span>
                          <strong className="tabular-nums">
                            {row.simulatedScore.toFixed(blendMode === "raw" ? 1 : 2)}
                          </strong>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                            Official rank
                          </span>
                          <strong className="tabular-nums">{row.officialRank ?? "—"}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden max-w-full overflow-x-auto sm:block">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      <th className="pb-3 pr-3">#</th>
                      <th className="pb-3 pr-3">Entry</th>
                      <th className="pb-3 pr-3 text-right">Jury</th>
                      <th className="pb-3 pr-3 text-right">Tele</th>
                      <th className="pb-3 pr-3 text-right">Score</th>
                      <th className="pb-3 pr-3 text-right">Official</th>
                      <th className="pb-3 text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.rows.map((row) => {
                      const display = displayMap.get(row.id);
                      return (
                        <tr key={row.id} className="border-b border-border/50 last:border-0">
                          <td className="py-3 pr-3 font-display text-lg font-semibold">
                            {row.simulatedRank}
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex min-w-0 items-center gap-2">
                              {display && (
                                <FlagChip
                                  code={display.short_code}
                                  color={display.accent_color}
                                  image={display.flag_image}
                                  size="sm"
                                />
                              )}
                              <span className="font-semibold">{row.name}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums">
                            {row.simulatedJuryPoints}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums">
                            {row.simulatedTelevotePoints}
                          </td>
                          <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                            {row.simulatedScore.toFixed(blendMode === "raw" ? 1 : 2)}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums">
                            {row.officialRank ?? "—"}
                          </td>
                          <td className="py-3 text-right font-semibold tabular-nums">
                            {row.rankDelta == null
                              ? "—"
                              : row.rankDelta > 0
                                ? `+${row.rankDelta}`
                                : row.rankDelta}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}
