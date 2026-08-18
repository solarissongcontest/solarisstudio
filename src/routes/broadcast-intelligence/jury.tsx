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
  useShowParticipants,
  useShows,
  useShowVoters,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import { resolveShowPublication } from "@/lib/publication";

export const Route = createFileRoute("/broadcast-intelligence/jury")({
  head: () => ({ meta: [{ title: "Jury Replay — Solaris Studio" }] }),
  component: JuryReplayPage,
});

type JuryBallot = {
  key: string;
  name: string;
  votes: Array<{ recipientId: string; points: number }>;
};

function JuryReplayPage() {
  const { data: editions } = useEditions();
  const [editionId, setEditionId] = useState("");
  const { data: shows } = useShows(editionId || undefined);
  const [showId, setShowId] = useState("");
  const { data: countries } = useCountries();
  const { data: entities } = useAllContestEntities();
  const { data: participants } = useShowParticipants(showId || undefined);
  const { data: juryVotes } = useJuryVotes(showId || undefined);
  const { data: voters } = useShowVoters(showId || undefined);

  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    if (editionId || !editions?.length) return;
    const latest = editions.find((edition) => edition.published);
    if (latest) setEditionId(latest.id);
  }, [editionId, editions]);

  const eligibleShows = useMemo(
    () =>
      (shows ?? []).filter((show) => {
        const publication = resolveShowPublication(show);
        return Boolean(
          show.published && publication.jury_results && publication.detailed_voting,
        );
      }),
    [shows],
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
    setStep(0);
    setAutoPlay(false);
  }, [showId]);

  const displayMap = useMemo(
    () => entityDisplayMap(entities ?? [], countries ?? []),
    [entities, countries],
  );

  const participantIds = useMemo(
    () => [...new Set((participants ?? []).map((participant) => participant.country_id).filter(Boolean))],
    [participants],
  );

  const voterOptions = useMemo(
    () => resolveShowVoters(voters, participantIds, countries ?? []),
    [voters, participantIds, countries],
  );

  const ballots = useMemo<JuryBallot[]>(() => {
    const grouped = new Map<string, JuryBallot>();

    for (const vote of juryVotes ?? []) {
      const key = matchVoterKey(vote, voterOptions);
      if (!key || !vote.receiving_country_id) continue;
      const option = voterOptions.find((voter) => voter.key === key);
      const current = grouped.get(key) ?? {
        key,
        name: option?.name ?? "Jury",
        votes: [],
      };
      current.votes.push({ recipientId: vote.receiving_country_id, points: vote.points });
      grouped.set(key, current);
    }

    const order = new Map(voterOptions.map((voter, index) => [voter.key, index]));
    return [...grouped.values()]
      .map((ballot) => ({
        ...ballot,
        votes: [...ballot.votes].sort(
          (a, b) => b.points - a.points || a.recipientId.localeCompare(b.recipientId),
        ),
      }))
      .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  }, [juryVotes, voterOptions]);

  const standings = useMemo(() => {
    const totals = new Map(participantIds.map((id) => [id, 0]));
    for (const ballot of ballots.slice(0, step)) {
      for (const vote of ballot.votes) {
        totals.set(vote.recipientId, (totals.get(vote.recipientId) ?? 0) + vote.points);
      }
    }

    return [...totals.entries()]
      .map(([id, points]) => ({ id, points }))
      .sort(
        (a, b) =>
          b.points - a.points ||
          (displayMap.get(a.id)?.name ?? a.id).localeCompare(displayMap.get(b.id)?.name ?? b.id),
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [participantIds, ballots, step, displayMap]);

  const currentBallot = step > 0 ? ballots[step - 1] ?? null : null;
  const nextBallot = ballots[step] ?? null;
  const finished = ballots.length > 0 && step >= ballots.length;
  const selectedEdition = (editions ?? []).find((edition) => edition.id === editionId);
  const selectedShow = eligibleShows.find((show) => show.id === showId);

  useEffect(() => {
    if (!autoPlay || finished || !ballots.length) {
      if (finished) setAutoPlay(false);
      return;
    }
    const timer = window.setTimeout(
      () => setStep((current) => Math.min(ballots.length, current + 1)),
      1500,
    );
    return () => window.clearTimeout(timer);
  }, [autoPlay, finished, ballots.length, step]);

  const revealNext = () => {
    if (finished) {
      setStep(0);
      setAutoPlay(false);
      return;
    }
    setStep((current) => Math.min(ballots.length, current + 1));
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Broadcast Intelligence"
        title="Jury Replay"
        description="Replay published jury ballots one jury at a time and watch the scoreboard build before the televote. Only shows with public detailed voting are available."
        actions={
          <Link
            to="/broadcast-intelligence"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm sm:w-auto"
          >
            ← Results replay
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-5">
        <div className="space-y-4">
          <Panel title="Choose a show" description="Detailed jury voting must be public">
            <label className="block text-xs font-semibold text-muted-foreground">Edition</label>
            <select
              value={editionId}
              onChange={(event) => {
                setEditionId(event.target.value);
                setShowId("");
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
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
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
            >
              {!eligibleShows.length && <option value="">No detailed jury vote available</option>}
              {eligibleShows.map((show) => (
                <option key={show.id} value={show.id}>{show.name}</option>
              ))}
            </select>

            {!eligibleShows.length && selectedEdition && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                No show in this edition currently publishes its full jury voting matrix.
              </p>
            )}
          </Panel>

          <Panel title="Replay controls" description={selectedShow?.name}>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={revealNext}
                disabled={!ballots.length}
                className="min-h-11 rounded-xl border border-border bg-surface px-3 text-xs font-semibold disabled:opacity-50"
              >
                {finished ? "Restart" : "Next jury"}
              </button>
              <button
                type="button"
                onClick={() => setAutoPlay((current) => !current)}
                disabled={!ballots.length || finished}
                className="min-h-11 rounded-xl border border-border bg-surface px-3 text-xs font-semibold disabled:opacity-50"
              >
                {autoPlay ? "Pause" : "Auto play"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep(0);
                  setAutoPlay(false);
                }}
                className="col-span-2 min-h-10 rounded-xl border border-border bg-surface px-3 text-xs font-semibold"
              >
                Reset
              </button>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-strong">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${ballots.length ? (step / ballots.length) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {step} of {ballots.length} juries revealed
            </p>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel
            title="On air"
            description={currentBallot ? `Latest jury: ${currentBallot.name}` : "Start the replay to reveal the first jury"}
          >
            {currentBallot ? (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Latest ballot</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{currentBallot.name}</h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {currentBallot.votes
                    .filter((vote) => vote.points > 0)
                    .slice(0, 10)
                    .map((vote) => {
                      const display = displayMap.get(vote.recipientId);
                      return (
                        <div key={vote.recipientId} className="flex items-center gap-3 rounded-xl bg-surface p-3">
                          {display && (
                            <FlagChip
                              code={display.short_code}
                              color={display.accent_color}
                              image={display.flag_image}
                              size="sm"
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                            {display?.name ?? vote.recipientId}
                          </span>
                          <strong className="numeric shrink-0 text-primary">+{vote.points}</strong>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The scoreboard begins at zero. Each published jury ballot is added in sequence.
              </p>
            )}
          </Panel>

          <Panel
            title="Live jury scoreboard"
            description={nextBallot ? `Next: ${nextBallot.name}` : finished ? "All juries revealed" : undefined}
          >
            {standings.length ? (
              <div className="divide-y divide-border/60">
                {standings.map((row) => {
                  const display = displayMap.get(row.id);
                  return (
                    <div key={row.id} className="grid grid-cols-[34px_36px_minmax(0,1fr)_auto] items-center gap-2 py-2.5">
                      <span className="numeric text-center text-xs font-semibold text-muted-foreground">#{row.rank}</span>
                      {display ? (
                        <FlagChip
                          code={display.short_code}
                          color={display.accent_color}
                          image={display.flag_image}
                          size="sm"
                        />
                      ) : <span />}
                      <span className="min-w-0 truncate text-sm font-semibold">{display?.name ?? row.id}</span>
                      <span className="numeric text-sm font-bold">{row.points} pts</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Choose a show with published detailed jury voting.</p>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
