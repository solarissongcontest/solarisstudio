import { useEffect, useMemo, useState } from "react";

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
  type TasteDnaJuryBallot,
  type TasteDnaResultEntry,
} from "@/lib/taste-dna";
import { useDeleteTasteBallot, useSaveTasteBallot, useTasteBallots } from "@/lib/taste-data";
import { projectTasteHistory, reconcileTasteRanking } from "@/lib/v3-taste-dna";
import { V3Screen, V3ScreenHeader, V3Section, V3StatusChip, V3Surface } from "./V3Foundation";

function moveItem(items: string[], from: number, to: number) {
  if (from === to || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--v3-text-secondary)]">{label}</p>
        <strong className="text-lg tabular-nums">{value.toFixed(1)}%</strong>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
        <div className="h-full rounded-full bg-[var(--v3-accent)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-[var(--v3-text-tertiary)]">{note}</p>
    </div>
  );
}

export function V3TasteDnaScreen() {
  const session = useFanSession();
  const viewerId = session.data?.id;
  const editionsQuery = useEditions();
  const countriesQuery = useCountries();
  const entitiesQuery = useAllContestEntities();

  const [editionId, setEditionId] = useState("");
  const [showId, setShowId] = useState("");
  const [ranking, setRanking] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const showsQuery = useShows(editionId || undefined);
  const participantsQuery = useShowParticipants(showId || undefined);
  const resultsQuery = useResults(showId || undefined);
  const juryVotesQuery = useJuryVotes(showId || undefined);
  const votersQuery = useShowVoters(showId || undefined);
  const tasteQuery = useTasteBallots(viewerId);
  const saveBallot = useSaveTasteBallot(viewerId);
  const deleteBallot = useDeleteTasteBallot(viewerId);

  useEffect(() => {
    if (editionId || !editionsQuery.data?.length) return;
    const firstPublished = editionsQuery.data.find((edition) => edition.published);
    if (firstPublished) setEditionId(firstPublished.id);
  }, [editionId, editionsQuery.data]);

  const eligibleShows = useMemo(
    () =>
      (showsQuery.data ?? []).filter((show) => {
        const publication = resolveShowPublication(show);
        return Boolean(
          show.published &&
            publication.results &&
            publication.jury_results &&
            publication.televote_results,
        );
      }),
    [showsQuery.data],
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

  const displayMap = useMemo(
    () => entityDisplayMap(entitiesQuery.data ?? [], countriesQuery.data ?? []),
    [entitiesQuery.data, countriesQuery.data],
  );

  const resultEntries = useMemo<TasteDnaResultEntry[]>(
    () =>
      (resultsQuery.data ?? [])
        .filter((result) => Boolean(result.country_id))
        .map((result) => ({
          id: result.country_id,
          juryPoints: result.jury_points,
          televotePoints: result.televote_points,
          totalPoints: result.total_points,
          officialRank: result.final_rank,
        })),
    [resultsQuery.data],
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

  const savedBallot = (tasteQuery.data?.ballots ?? []).find((ballot) => ballot.show_id === showId);
  const savedBallotKey = savedBallot ? `${savedBallot.updated_at}:${savedBallot.ranking.join("|")}` : "";
  const officialRankingKey = officialRanking.join("|");

  useEffect(() => {
    if (!showId || !officialRanking.length) {
      setRanking([]);
      return;
    }
    setRanking(reconcileTasteRanking(savedBallot?.ranking, officialRanking));
    setMessage(null);
  }, [showId, savedBallotKey, officialRankingKey]);

  const participantMap = useMemo(
    () => new Map((participantsQuery.data ?? []).map((participant) => [participant.country_id, participant])),
    [participantsQuery.data],
  );
  const participantIds = useMemo(
    () => [...new Set((participantsQuery.data ?? []).map((participant) => participant.country_id).filter(Boolean))],
    [participantsQuery.data],
  );
  const voterOptions = useMemo(
    () => resolveShowVoters(votersQuery.data, participantIds, countriesQuery.data ?? []),
    [votersQuery.data, participantIds, countriesQuery.data],
  );
  const voterNameMap = useMemo(
    () => new Map(voterOptions.map((voter) => [voter.key, voter.name])),
    [voterOptions],
  );

  const juryBallots = useMemo<TasteDnaJuryBallot[]>(() => {
    const grouped = new Map<string, Array<{ recipientId: string; points: number }>>();
    for (const vote of juryVotesQuery.data ?? []) {
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
  }, [juryVotesQuery.data, voterOptions, voterNameMap]);

  const history = useMemo(
    () =>
      projectTasteHistory(
        (tasteQuery.data?.ballots ?? []).map((ballot) => ({ showId: ballot.show_id, ranking: ballot.ranking })),
        showId,
      ),
    [tasteQuery.data?.ballots, showId],
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

  const selectedShow = eligibleShows.find((show) => show.id === showId);
  const selectedEdition = (editionsQuery.data ?? []).find((edition) => edition.id === editionId);
  const loading =
    editionsQuery.isLoading ||
    countriesQuery.isLoading ||
    entitiesQuery.isLoading ||
    showsQuery.isLoading ||
    (Boolean(showId) && (participantsQuery.isLoading || resultsQuery.isLoading || juryVotesQuery.isLoading));
  const failed =
    editionsQuery.isError ||
    countriesQuery.isError ||
    entitiesQuery.isError ||
    showsQuery.isError ||
    participantsQuery.isError ||
    resultsQuery.isError ||
    juryVotesQuery.isError;

  const save = async () => {
    setMessage(null);
    if (!viewerId) {
      setMessage("Sign in to save this ranking privately. The current draft stays only on this page.");
      return;
    }
    if (!showId || ranking.length < 3) return;
    try {
      await saveBallot.mutateAsync({ showId, ranking });
      setMessage("Private Taste DNA ranking saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Taste DNA ranking could not be saved.");
    }
  };

  const remove = async () => {
    if (!showId || !savedBallot) return;
    setMessage(null);
    try {
      await deleteBallot.mutateAsync(showId);
      setRanking(officialRanking);
      setMessage("Saved ranking removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Saved ranking could not be removed.");
    }
  };

  return (
    <V3Screen className="pb-8">
      <div data-v3-taste-dna-root="">
        <V3ScreenHeader
          kicker="Personal analytics"
          title="Taste DNA"
          description="Rank a published field and compare your preferences with published jury, televote and overall results. Saved rankings stay private to your account."
        />

        {loading ? (
          <V3Surface><p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">Loading published Taste DNA data…</p></V3Surface>
        ) : failed ? (
          <V3Surface>
            <div data-v3-taste-dna-state="error">
              <p role="alert" className="text-sm font-semibold">Taste DNA could not load its published comparison data.</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">Solaris will not substitute cached or browser-persisted contest state.</p>
            </div>
          </V3Surface>
        ) : (
          <>
            <V3Section title="Published field" meta={selectedEdition ? editionLabel(selectedEdition) : "Choose an edition"}>
              <V3Surface level="raised" className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-[var(--v3-text-secondary)]">
                  Edition
                  <select
                    value={editionId}
                    onChange={(event) => {
                      setEditionId(event.target.value);
                      setShowId("");
                    }}
                    className="mt-2 min-h-11 w-full rounded-xl border border-[var(--v3-border-subtle)] bg-black/20 px-3 text-sm text-[var(--v3-text-primary)]"
                  >
                    {(editionsQuery.data ?? []).filter((edition) => edition.published).map((edition) => (
                      <option key={edition.id} value={edition.id}>{editionLabel(edition)}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-[var(--v3-text-secondary)]">
                  Show
                  <select
                    value={showId}
                    onChange={(event) => setShowId(event.target.value)}
                    disabled={!eligibleShows.length}
                    className="mt-2 min-h-11 w-full rounded-xl border border-[var(--v3-border-subtle)] bg-black/20 px-3 text-sm text-[var(--v3-text-primary)] disabled:opacity-60"
                  >
                    {!eligibleShows.length ? <option value="">No eligible published show</option> : null}
                    {eligibleShows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
                  </select>
                </label>
                {!eligibleShows.length ? (
                  <p className="sm:col-span-2 text-xs leading-5 text-[var(--v3-text-tertiary)]">
                    Taste DNA becomes available only after the required jury, televote and overall result layers are public.
                  </p>
                ) : null}
              </V3Surface>
            </V3Section>

            <V3Section title="Your ranking" meta={`${ranking.length} entries`}>
              {!showId || !ranking.length ? (
                <V3Surface><p className="text-sm text-[var(--v3-text-secondary)]">Choose an eligible published show to start.</p></V3Surface>
              ) : (
                <V3Surface level="raised">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button type="button" onClick={() => setRanking(officialRanking)} className="min-h-11 rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold">Official order</button>
                    <button type="button" onClick={() => setRanking(juryRanking)} className="min-h-11 rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold">Jury order</button>
                    <button type="button" onClick={() => setRanking(televoteRanking)} className="min-h-11 rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold">Televote order</button>
                  </div>
                  <ol className="mt-3 max-h-[36rem] space-y-1 overflow-y-auto pr-1">
                    {ranking.map((id, index) => {
                      const display = displayMap.get(id);
                      const participant = participantMap.get(id);
                      const label = display?.name ?? "entry";
                      return (
                        <li key={id} className="flex min-h-12 items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5">
                          <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums">{index + 1}</span>
                          {display ? <FlagChip code={display.short_code} color={display.accent_color} image={display.flag_image} size="sm" /> : null}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{display?.name ?? "Unknown entry"}</p>
                            {participant?.artist || participant?.song ? (
                              <p className="truncate text-[10px] text-[var(--v3-text-tertiary)]">{[participant.artist, participant.song].filter(Boolean).join(" · ")}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button type="button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => setRanking((current) => moveItem(current, index, index - 1))} className="grid size-9 place-items-center rounded-lg border border-[var(--v3-border-subtle)] disabled:opacity-30">↑</button>
                            <button type="button" aria-label={`Move ${label} down`} disabled={index === ranking.length - 1} onClick={() => setRanking((current) => moveItem(current, index, index + 1))} className="grid size-9 place-items-center rounded-lg border border-[var(--v3-border-subtle)] disabled:opacity-30">↓</button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </V3Surface>
              )}
            </V3Section>

            <V3Section title="Your fingerprint" meta={profile ? profile.personalityLabel : "Rank at least three entries"}>
              {!profile ? (
                <V3Surface><p className="text-sm text-[var(--v3-text-secondary)]">A profile appears once the published field and your ranking are available.</p></V3Surface>
              ) : (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <V3Surface level="raised">
                    <div className="flex flex-wrap items-center gap-2">
                      <V3StatusChip tone="progress">{profile.personalityLabel}</V3StatusChip>
                      <V3StatusChip tone="neutral">{profile.alignmentLabel}</V3StatusChip>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Metric label="Jury match" value={profile.jurySimilarity} note="Similarity between your order and the published jury result order." />
                      <Metric label="Televote match" value={profile.televoteSimilarity} note="Similarity between your order and the published televote result order." />
                      <Metric label="Overall match" value={profile.overallSimilarity} note="Similarity between your order and the published combined result." />
                      <Metric label="Contrarian" value={profile.contrarianScore} note="Inverse of overall-result similarity, not a judgment of taste quality." />
                    </div>
                  </V3Surface>
                  <V3Surface>
                    <p className="text-sm font-semibold">Methodology</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--v3-text-secondary)]">
                      Taste DNA is descriptive personal analysis. It compares this ranking with already-published contest data. It is not Country Voting DNA, a prediction, a recommendation, or an objective score of whether your taste is good.
                    </p>
                    {profile.similarJuries[0] ? (
                      <p className="mt-3 text-xs leading-5"><span className="text-[var(--v3-text-tertiary)]">Closest published jury:</span> <strong>{profile.similarJuries[0].name}</strong> · {profile.similarJuries[0].similarity.toFixed(1)}%</p>
                    ) : null}
                  </V3Surface>
                </div>
              )}
            </V3Section>

            <V3Section title="Private history" meta={viewerId ? `${tasteQuery.data?.ballots.length ?? 0} saved` : "Signed out"}>
              <V3Surface>
                {tasteQuery.data?.schemaReady === false ? (
                  <div data-v3-taste-dna-state="unavailable">
                    <p className="text-sm font-semibold">Private Taste DNA history is unavailable</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">No browser-local replacement will be created.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={save} disabled={!showId || ranking.length < 3 || saveBallot.isPending} className="min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-black disabled:opacity-50">
                        {saveBallot.isPending ? "Saving…" : savedBallot ? "Save updated ranking" : "Save privately"}
                      </button>
                      {savedBallot ? (
                        <button type="button" onClick={remove} disabled={deleteBallot.isPending} className="min-h-11 rounded-xl border border-[var(--v3-border-subtle)] px-4 text-sm font-semibold disabled:opacity-50">
                          {deleteBallot.isPending ? "Removing…" : "Remove saved ranking"}
                        </button>
                      ) : null}
                    </div>
                    {!viewerId ? <p className="mt-3 text-xs leading-5 text-[var(--v3-text-secondary)]">You can analyze a ranking while signed out. Sign in only if you want Solaris to keep it privately across visits.</p> : null}
                    {profile?.recurringFavourites.length ? (
                      <div className="mt-4 border-t border-[var(--v3-border-subtle)] pt-3">
                        <p className="text-xs font-semibold">Recurring favourites across saved rankings</p>
                        <ul className="mt-2 space-y-1 text-xs text-[var(--v3-text-secondary)]">
                          {profile.recurringFavourites.slice(0, 5).map((item) => <li key={item.id}>{item.name} · top 3 in {item.topThreeCount} ranking{item.topThreeCount === 1 ? "" : "s"}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
                {message ? <p className="mt-3 text-xs leading-5 text-[var(--v3-text-secondary)]" role="status" aria-live="polite">{message}</p> : null}
              </V3Surface>
            </V3Section>
          </>
        )}
      </div>
    </V3Screen>
  );
}
