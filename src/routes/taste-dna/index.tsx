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
import { useFanSession } from "@/lib/prediction-data";
import { resolveShowPublication } from "@/lib/publication";
import {
  buildTasteDna,
  rankingFromScores,
  tasteFingerprintText,
  type TasteDnaJuryBallot,
  type TasteDnaResultEntry,
} from "@/lib/taste-dna";
import { useDeleteTasteBallot, useSaveTasteBallot, useTasteBallots } from "@/lib/taste-data";

export const Route = createFileRoute("/taste-dna/")({
  head: () => ({ meta: [{ title: "Taste DNA — Solaris Studio" }] }),
  component: TasteDnaPage,
});

function moveItem(items: string[], from: number, to: number) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">{label}</span>
        <strong className="shrink-0">{value.toFixed(1)}%</strong>
      </div>
      <div className="mt-2 h-2 min-w-0 overflow-hidden rounded-full bg-surface-strong">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function TasteDnaPage() {
  const { data: user } = useFanSession();
  const { data: editions } = useEditions();
  const [editionId, setEditionId] = useState("");
  const { data: editionShows } = useShows(editionId || undefined);
  const [showId, setShowId] = useState("");
  const { data: countries } = useCountries();
  const { data: entities } = useAllContestEntities();
  const { data: participants } = useShowParticipants(showId || undefined);
  const { data: results } = useResults(showId || undefined);
  const { data: juryVotes } = useJuryVotes(showId || undefined);
  const { data: voters } = useShowVoters(showId || undefined);
  const { data: tasteData } = useTasteBallots(user?.id);
  const saveBallot = useSaveTasteBallot(user?.id);
  const deleteBallot = useDeleteTasteBallot(user?.id);

  const [ranking, setRanking] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

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

  const selectedShow = eligibleShows.find((show) => show.id === showId);
  const selectedEdition = (editions ?? []).find((edition) => edition.id === editionId);
  const displayMap = useMemo(
    () => entityDisplayMap(entities ?? [], countries ?? []),
    [entities, countries],
  );

  const resultEntries = useMemo<TasteDnaResultEntry[]>(
    () =>
      (results ?? [])
        .filter((result) => Boolean(result.country_id))
        .map((result) => ({
          id: result.country_id,
          juryPoints: result.jury_points,
          televotePoints: result.televote_points,
          totalPoints: result.total_points,
          officialRank: result.final_rank,
        })),
    [results],
  );

  const officialRanking = useMemo(
    () => rankingFromScores(resultEntries, (entry) => entry.totalPoints),
    [resultEntries],
  );
  const juryRanking = useMemo(
    () => rankingFromScores(resultEntries, (entry) => entry.juryPoints),
    [resultEntries],
  );
  const televoteRanking = useMemo(
    () => rankingFromScores(resultEntries, (entry) => entry.televotePoints),
    [resultEntries],
  );

  const savedBallot = (tasteData?.ballots ?? []).find((ballot) => ballot.show_id === showId);
  const savedBallotKey = savedBallot ? `${savedBallot.updated_at}:${savedBallot.ranking.join("|")}` : "";
  const officialRankingKey = officialRanking.join("|");

  useEffect(() => {
    if (!showId || !officialRanking.length) {
      setRanking([]);
      return;
    }

    if (savedBallot?.ranking?.length) {
      const allowed = new Set(officialRanking);
      const saved = savedBallot.ranking.filter((id) => allowed.has(id));
      const seen = new Set(saved);
      setRanking([...saved, ...officialRanking.filter((id) => !seen.has(id))]);
    } else {
      setRanking(officialRanking);
    }
    setMessage(null);
  }, [showId, savedBallotKey, officialRankingKey]);

  const participantMap = useMemo(
    () => new Map((participants ?? []).map((participant) => [participant.country_id, participant])),
    [participants],
  );
  const participantIds = useMemo(
    () => [...new Set((participants ?? []).map((participant) => participant.country_id).filter(Boolean))],
    [participants],
  );
  const voterOptions = useMemo(
    () => resolveShowVoters(voters, participantIds, countries ?? []),
    [voters, participantIds, countries],
  );
  const voterNameMap = useMemo(
    () => new Map(voterOptions.map((voter) => [voter.key, voter.name])),
    [voterOptions],
  );

  const juryBallots = useMemo<TasteDnaJuryBallot[]>(() => {
    const grouped = new Map<string, Array<{ recipientId: string; points: number }>>();

    for (const vote of juryVotes ?? []) {
      const key = matchVoterKey(vote, voterOptions);
      if (!key || !vote.receiving_country_id) continue;
      const ballot = grouped.get(key) ?? [];
      ballot.push({ recipientId: vote.receiving_country_id, points: vote.points });
      grouped.set(key, ballot);
    }

    return [...grouped.entries()].map(([key, ballot]) => ({
      key,
      name: voterNameMap.get(key) ?? "Jury",
      ranking: [...ballot]
        .sort((a, b) => b.points - a.points || a.recipientId.localeCompare(b.recipientId))
        .map((vote) => vote.recipientId),
    }));
  }, [juryVotes, voterOptions, voterNameMap]);

  const history = useMemo(
    () =>
      (tasteData?.ballots ?? [])
        .filter((ballot) => ballot.show_id !== showId)
        .map((ballot) => ({ showId: ballot.show_id, ranking: ballot.ranking })),
    [tasteData?.ballots, showId],
  );

  const profile = useMemo(
    () =>
      buildTasteDna({
        ranking,
        results: resultEntries,
        juryBallots,
        history,
        nameForId: (id) => displayMap.get(id)?.name ?? "Unknown entry",
      }),
    [ranking, resultEntries, juryBallots, history, displayMap],
  );

  const save = async () => {
    setMessage(null);
    if (!user) {
      setMessage("Sign in to save this Taste DNA ballot. You can still use the analysis without an account.");
      return;
    }
    if (!showId || ranking.length < 3) return;

    try {
      await saveBallot.mutateAsync({ showId, ranking });
      setMessage("Taste ballot saved privately.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Taste ballot could not be saved.");
    }
  };

  const removeSaved = async () => {
    if (!showId || !savedBallot) return;
    setMessage(null);
    try {
      await deleteBallot.mutateAsync(showId);
      setRanking(officialRanking);
      setMessage("Saved ballot removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Saved ballot could not be removed.");
    }
  };

  const copyFingerprint = async () => {
    if (!profile || !selectedShow) return;
    try {
      await navigator.clipboard.writeText(
        tasteFingerprintText({ profile, showName: selectedShow.name }),
      );
      setMessage("Taste fingerprint copied.");
    } catch {
      setMessage("Your browser blocked clipboard access.");
    }
  };

  const setPreset = (preset: "official" | "jury" | "televote") => {
    setRanking(
      preset === "jury" ? juryRanking : preset === "televote" ? televoteRanking : officialRanking,
    );
    setMessage(null);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Personal analytics"
        title="Taste DNA"
        description="Rank a published field and Solaris compares your taste with the jury, televote, overall consensus and individual voting juries. Saved ballots are private to your account."
        actions={
          <Link
            to="/result-lab"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm sm:w-auto"
          >
            ← Result Lab
          </Link>
        }
      />

      <div className="grid min-w-0 gap-4 sm:gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <Panel title="1. Choose the field" description="Taste DNA needs public jury and televote results">
            <label className="block text-xs font-semibold text-muted-foreground">Edition</label>
            <select
              value={editionId}
              onChange={(event) => {
                setEditionId(event.target.value);
                setShowId("");
              }}
              className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              {(editions ?? []).filter((edition) => edition.published).map((edition) => (
                <option key={edition.id} value={edition.id}>{editionLabel(edition)}</option>
              ))}
            </select>

            <label className="mt-4 block text-xs font-semibold text-muted-foreground">Show</label>
            <select
              value={showId}
              onChange={(event) => setShowId(event.target.value)}
              disabled={!eligibleShows.length}
              className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
            >
              {!eligibleShows.length && <option value="">No eligible published show</option>}
              {eligibleShows.map((show) => (
                <option key={show.id} value={show.id}>{show.name}</option>
              ))}
            </select>

            {!eligibleShows.length && selectedEdition && (
              <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">
                Publish overall, jury and televote results for a show before Taste DNA can compare the three rankings.
              </p>
            )}
          </Panel>

          <Panel title="2. Build your ranking" description={`${ranking.length} entries · use the arrows to reorder`}>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => setPreset("official")} className="min-h-10 min-w-0 rounded-xl border border-border bg-surface px-2 text-xs font-semibold">
                Official
              </button>
              <button type="button" onClick={() => setPreset("jury")} className="min-h-10 min-w-0 rounded-xl border border-border bg-surface px-2 text-xs font-semibold">
                Jury
              </button>
              <button type="button" onClick={() => setPreset("televote")} className="min-h-10 min-w-0 rounded-xl border border-border bg-surface px-2 text-xs font-semibold">
                Televote
              </button>
            </div>

            <div className="mt-3 max-h-[620px] min-w-0 space-y-1 overflow-y-auto pr-1">
              {ranking.map((id, index) => {
                const display = displayMap.get(id);
                const participant = participantMap.get(id);
                return (
                  <div key={id} className="flex min-h-12 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl bg-surface px-2 py-1.5">
                    <span className="w-6 shrink-0 text-center font-display text-sm font-semibold">{index + 1}</span>
                    {display && (
                      <FlagChip
                        code={display.short_code}
                        color={display.accent_color}
                        image={display.flag_image}
                        size="sm"
                      />
                    )}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="truncate text-xs font-semibold">{display?.name ?? "Unknown entry"}</p>
                      {(participant?.artist || participant?.song) && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {[participant.artist, participant.song].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${display?.name ?? "entry"} up`}
                        disabled={index === 0}
                        onClick={() => setRanking((current) => moveItem(current, index, index - 1))}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${display?.name ?? "entry"} down`}
                        disabled={index === ranking.length - 1}
                        onClick={() => setRanking((current) => moveItem(current, index, index + 1))}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={save}
                disabled={!ranking.length || saveBallot.isPending}
                className="min-h-11 min-w-0 rounded-xl border border-border bg-surface px-3 text-sm font-semibold disabled:opacity-60"
              >
                {saveBallot.isPending ? "Saving…" : savedBallot ? "Update saved ballot" : "Save privately"}
              </button>
              <button
                type="button"
                onClick={removeSaved}
                disabled={!savedBallot || deleteBallot.isPending}
                className="min-h-11 min-w-0 rounded-xl border border-border bg-surface px-3 text-sm font-semibold disabled:opacity-40"
              >
                Remove saved
              </button>
            </div>

            {tasteData?.schemaReady === false && user && (
              <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">
                Saving is temporarily unavailable. Your live Taste DNA analysis still works normally.
              </p>
            )}
            {message && <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">{message}</p>}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-5">
          {profile ? (
            <>
              <Panel
                title="Your fingerprint"
                description={`${selectedShow?.name ?? "Selected show"} · ${profile.personalityLabel}`}
                actions={
                  <button type="button" onClick={copyFingerprint} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-primary">
                    Copy summary
                  </button>
                }
              >
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0 rounded-xl bg-surface p-3 sm:p-4">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Identity</p>
                    <p className="mt-2 break-words font-display text-lg font-semibold sm:text-xl">{profile.personalityLabel}</p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{profile.alignmentLabel}</p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-surface p-3 sm:p-4">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Jury match</p>
                    <p className="mt-2 font-display text-2xl font-semibold">{profile.jurySimilarity}%</p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-surface p-3 sm:p-4">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Televote match</p>
                    <p className="mt-2 font-display text-2xl font-semibold">{profile.televoteSimilarity}%</p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-surface p-3 sm:p-4">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Consensus match</p>
                    <p className="mt-2 font-display text-2xl font-semibold">{profile.overallSimilarity}%</p>
                  </div>
                </div>

                <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 md:gap-5">
                  <div className="min-w-0 space-y-4 rounded-xl bg-surface p-3 sm:p-4">
                    <MetricBar label="Mainstream" value={profile.mainstreamScore} />
                    <MetricBar label="Contrarian" value={profile.contrarianScore} />
                  </div>
                  <div className="min-w-0 space-y-4 rounded-xl bg-surface p-3 sm:p-4">
                    <MetricBar label="Jury side" value={profile.juryLean} />
                    <MetricBar label="Televote side" value={profile.televoteLean} />
                  </div>
                </div>
              </Panel>

              <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-5">
                <Panel title="Closest jury tastes" description="Based on overlap and position inside each published jury top ten">
                  {profile.similarJuries.length ? (
                    <div className="min-w-0 space-y-2">
                      {profile.similarJuries.map((match, index) => (
                        <div key={match.key} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-surface px-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-primary">#{index + 1} match</p>
                            <p className="truncate text-sm font-semibold">{match.name}</p>
                          </div>
                          <strong className="shrink-0 text-sm">{match.similarity}%</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="break-words text-sm leading-relaxed text-muted-foreground">
                      Individual jury comparisons appear when detailed voting is public for this show.
                    </p>
                  )}
                </Panel>

                <Panel title="Biggest disagreements" description="The juries whose top choices clash most with yours">
                  {profile.oppositeJuries.length ? (
                    <div className="min-w-0 space-y-2">
                      {profile.oppositeJuries.map((match, index) => (
                        <div key={match.key} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-surface px-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-primary">#{index + 1} opposite</p>
                            <p className="truncate text-sm font-semibold">{match.name}</p>
                          </div>
                          <strong className="shrink-0 text-xs sm:text-sm">{match.similarity}% match</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="break-words text-sm leading-relaxed text-muted-foreground">
                      No individual jury ballots are available publicly for this show.
                    </p>
                  )}
                </Panel>
              </div>

              <Panel title="Recurring favourites" description="Patterns across the Taste DNA ballots saved on your account">
                {user && profile.recurringFavourites.length ? (
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {profile.recurringFavourites.map((favourite) => {
                      const display = displayMap.get(favourite.id);
                      return (
                        <div key={favourite.id} className="min-w-0 rounded-xl bg-surface p-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {display && (
                              <FlagChip
                                code={display.short_code}
                                color={display.accent_color}
                                image={display.flag_image}
                                size="sm"
                              />
                            )}
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{favourite.name}</p>
                          </div>
                          <p className="mt-2 break-words text-xs text-muted-foreground">
                            Top 3 in {favourite.topThreeCount} · Top 10 in {favourite.topTenCount}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="break-words text-sm leading-relaxed text-muted-foreground">
                    {user
                      ? "Save Taste DNA rankings for more than one show and recurring favourites will start appearing here."
                      : "Sign in and save rankings across shows to unlock recurring favourite patterns."}
                  </p>
                )}
              </Panel>
            </>
          ) : (
            <Panel title="Taste DNA">
              <p className="break-words text-sm leading-relaxed text-muted-foreground">
                Choose a show with published jury and televote results. Your ranking will become the comparison baseline.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}
