import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import {
  replayProgress,
  type BroadcastMomentKind,
} from "@/lib/broadcast-intelligence";
import type { V3BroadcastIntelligenceBundle } from "@/lib/v3-broadcast-intelligence";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

const MOMENT_LABELS: Record<BroadcastMomentKind, string> = {
  lead_change: "Lead change",
  comeback: "Comeback",
  collapse: "Collapse",
  jury_landslide: "Jury boost",
  televote_surge: "Televote surge",
  split_vote: "Split vote",
  photo_finish: "Photo finish",
  balanced: "Balanced",
  dominant: "Dominant",
};

export function V3BroadcastIntelligenceScreen({
  bundle,
  onShowChange,
  changingShow = false,
}: {
  bundle: V3BroadcastIntelligenceBundle;
  onShowChange: (showId: string) => void;
  changingShow?: boolean;
}) {
  const [replayStep, setReplayStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const { intelligence } = bundle;

  const selectedOption =
    bundle.options.find((option) => option.id === bundle.selectedShowId) ?? null;
  const selectedEditionId = selectedOption?.editionId ?? "";
  const editionOptions = useMemo(() => {
    const seen = new Set<string>();
    return bundle.options.filter((option) => {
      if (seen.has(option.editionId)) return false;
      seen.add(option.editionId);
      return true;
    });
  }, [bundle.options]);
  const showOptions = bundle.options.filter(
    (option) => option.editionId === selectedEditionId,
  );
  const identityMap = useMemo(
    () => new Map(bundle.identities.map((identity) => [identity.id, identity])),
    [bundle.identities],
  );
  const liveRows = useMemo(
    () => replayProgress(bundle.entries, replayStep),
    [bundle.entries, replayStep],
  );

  const currentReveal =
    replayStep > 0 ? intelligence.replay[replayStep - 1] ?? null : null;
  const nextReveal = intelligence.replay[replayStep] ?? null;
  const replayFinished =
    intelligence.replay.length > 0 && replayStep >= intelligence.replay.length;

  useEffect(() => {
    setReplayStep(0);
    setAutoPlay(false);
  }, [bundle.selectedShowId]);

  useEffect(() => {
    if (!autoPlay || replayStep >= intelligence.replay.length) {
      if (replayStep >= intelligence.replay.length) setAutoPlay(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setReplayStep((current) =>
        Math.min(intelligence.replay.length, current + 1),
      );
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [autoPlay, intelligence.replay.length, replayStep]);

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Broadcast Intelligence"
        title="Replay the voting"
        description="Inspect an official published result, replay a generated televote reveal and find the biggest jury-to-televote swings."
        editorial
      />

      <V3Surface level="raised" className="p-5">
        <div data-v3-broadcast-replay-disclaimer="">
          <p className="v3-kicker">Generated replay, official totals</p>
          <p className="mt-2 text-sm leading-6 text-white/62">
            This replay is deterministically reconstructed from official published
            jury and televote totals. It does not claim to reproduce the exact
            historical broadcast reveal order unless Solaris stores that order.
          </p>
        </div>
      </V3Surface>

      <V3Section title="Choose a result">
        <V3Surface className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="grid gap-2 text-xs font-semibold text-white/52">
            Edition
            <select
              value={selectedEditionId}
              onChange={(event) => {
                const next = bundle.options.find(
                  (option) => option.editionId === event.target.value,
                );
                if (next) onShowChange(next.id);
              }}
              disabled={changingShow || !editionOptions.length}
              className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-sm text-white outline-none disabled:opacity-50"
            >
              {!editionOptions.length ? (
                <option value="">No published results</option>
              ) : null}
              {editionOptions.map((option) => (
                <option key={option.editionId} value={option.editionId}>
                  {option.editionName}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-xs font-semibold text-white/52">
            Show
            <select
              value={bundle.selectedShowId ?? ""}
              onChange={(event) => onShowChange(event.target.value)}
              disabled={changingShow || !showOptions.length}
              className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-sm text-white outline-none disabled:opacity-50"
            >
              {!showOptions.length ? (
                <option value="">No fully published show</option>
              ) : null}
              {showOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        </V3Surface>
      </V3Section>

      {!bundle.selectedShowId || !intelligence.rows.length ? (
        <V3Surface className="p-5">
          <div role="status" data-v3-broadcast-intelligence-empty="">
            <p className="text-sm font-semibold">No fully published result to replay</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Broadcast Intelligence only opens once result, jury and televote
              layers are all officially public.
            </p>
          </div>
        </V3Surface>
      ) : (
        <>
          {intelligence.winner ? (
            <V3Surface level="raised" className="p-5">
              <p className="v3-kicker">Official winner</p>
              <div className="mt-3 flex items-center gap-3">
                {identityMap.get(intelligence.winner.id) ? (
                  <FlagChip
                    code={identityMap.get(intelligence.winner.id)!.shortCode}
                    color={identityMap.get(intelligence.winner.id)!.accentColor}
                    image={identityMap.get(intelligence.winner.id)!.flagImage}
                    size="lg"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-bold tracking-[-0.03em]">
                    {intelligence.winner.name}
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    {intelligence.winner.totalPoints} points · {selectedOption?.name}
                  </p>
                </div>
                <V3StatusChip tone="success">#{intelligence.winner.finalRank}</V3StatusChip>
              </div>
            </V3Surface>
          ) : null}

          {intelligence.metrics.length ? (
            <V3Section title="Broadcast pulse">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {intelligence.metrics.map((metric) => (
                  <V3Surface key={metric.label} className="p-4">
                    <p className="v3-kicker">{metric.label}</p>
                    <p className="mt-2 text-xl font-bold tabular-nums">
                      {metric.value}
                    </p>
                    <p className="mt-1 text-[0.7rem] leading-5 text-white/45">
                      {metric.detail}
                    </p>
                  </V3Surface>
                ))}
              </div>
            </V3Section>
          ) : null}

          <V3Section title="Results replay">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
              <V3Surface level="raised" className="p-4">
                <p className="v3-kicker">Replay status</p>
                {currentReveal ? (
                  <div className="mt-2">
                    <p className="text-xl font-bold">{currentReveal.name}</p>
                    <p className="mt-1 text-sm text-white/52">
                      +{currentReveal.televotePoints} televote points
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/48">
                      <span>Now #{currentReveal.rankAfter}</span>
                      {currentReveal.rankChange > 0 ? (
                        <V3StatusChip tone="success">
                          Up {currentReveal.rankChange}
                        </V3StatusChip>
                      ) : currentReveal.rankChange < 0 ? (
                        <V3StatusChip tone="danger">
                          Down {Math.abs(currentReveal.rankChange)}
                        </V3StatusChip>
                      ) : null}
                      {currentReveal.becameLeader ? (
                        <V3StatusChip tone="live">New leader</V3StatusChip>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="text-xl font-bold">Jury result</p>
                    <p className="mt-1 text-xs leading-5 text-white/48">
                      Start the generated replay to add published televote totals.
                    </p>
                  </div>
                )}

                <div className="mt-5">
                  <div className="flex justify-between gap-3 text-[0.68rem] text-white/42">
                    <span>
                      {replayStep}/{intelligence.replay.length} revealed
                    </span>
                    {nextReveal ? (
                      <span className="truncate text-right">Next: {nextReveal.name}</span>
                    ) : null}
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-white/65 transition-[width] duration-300"
                      style={{
                        width: `${intelligence.replay.length ? (replayStep / intelligence.replay.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </V3Surface>

              <V3Surface className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={() => {
                    if (replayFinished) {
                      setReplayStep(0);
                      setAutoPlay(false);
                      return;
                    }
                    setReplayStep((current) =>
                      Math.min(intelligence.replay.length, current + 1),
                    );
                  }}
                  disabled={!intelligence.replay.length}
                  className="min-h-11 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {replayFinished ? "Restart" : "Next reveal"}
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPlay((current) => !current)}
                  disabled={replayFinished || !intelligence.replay.length}
                  className="min-h-11 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {autoPlay ? "Pause" : "Auto play"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplayStep(0);
                    setAutoPlay(false);
                  }}
                  className="col-span-2 min-h-11 rounded-xl border border-white/[0.08] px-3 text-xs font-semibold text-white/62 lg:col-span-1"
                >
                  Reset
                </button>
              </V3Surface>
            </div>

            <ol className="grid gap-2" aria-label="Generated live scoreboard">
              {liveRows.map((row) => {
                const identity = identityMap.get(row.id);
                return (
                  <li key={row.id}>
                    <V3Surface className="flex min-h-16 items-center gap-3 px-3 py-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-sm font-bold tabular-nums text-white/58">
                        {row.liveRank}
                      </span>
                      {identity ? (
                        <FlagChip
                          code={identity.shortCode}
                          color={identity.accentColor}
                          image={identity.flagImage}
                          size="sm"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {row.name}
                      </span>
                      <span className="text-right">
                        <span className="block text-base font-bold tabular-nums">
                          {row.liveScore}
                        </span>
                        <span className="block text-[0.65rem] text-white/38">
                          {row.televoteRevealed ? "televote revealed" : "jury total"}
                        </span>
                      </span>
                    </V3Surface>
                  </li>
                );
              })}
            </ol>
          </V3Section>

          {intelligence.moments.length ? (
            <V3Section title="Key moments">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {intelligence.moments.slice(0, 9).map((moment) => (
                  <V3Surface key={moment.id} className="p-4">
                    <p className="v3-kicker">{MOMENT_LABELS[moment.kind]}</p>
                    <p className="mt-2 text-sm font-semibold">{moment.title}</p>
                    <p className="mt-1 text-xs leading-5 text-white/48">
                      {moment.summary}
                    </p>
                  </V3Surface>
                ))}
              </div>
            </V3Section>
          ) : null}

          <V3Section title="Jury to final comparison">
            <div className="overflow-x-auto rounded-[var(--v3-radius-xl)] border border-white/[0.07]">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <thead className="bg-white/[0.025] text-[0.68rem] uppercase tracking-wide text-white/42">
                  <tr>
                    <th className="px-3 py-3">Final</th>
                    <th className="px-3 py-3">Entry</th>
                    <th className="px-3 py-3 text-right">Jury</th>
                    <th className="px-3 py-3 text-right">Televote</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3 text-right">Jury → final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.07]">
                  {intelligence.rows.map((row) => {
                    const identity = identityMap.get(row.id);
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-3 font-semibold tabular-nums">
                          #{row.finalRank}
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2">
                            {identity ? (
                              <FlagChip
                                code={identity.shortCode}
                                color={identity.accentColor}
                                image={identity.flagImage}
                                size="sm"
                              />
                            ) : null}
                            <span className="truncate font-semibold">{row.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {row.juryPoints} <span className="text-white/38">(#{row.juryRank})</span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {row.televotePoints}{" "}
                          <span className="text-white/38">(#{row.televoteRank})</span>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">
                          {row.totalPoints}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">
                          {row.juryToFinalChange > 0
                            ? `+${row.juryToFinalChange}`
                            : row.juryToFinalChange}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </V3Section>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/result-lab"
              className="min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-4 py-3 text-sm font-semibold"
            >
              Open Result Lab
            </Link>
            <Link
              to="/results"
              className="min-h-11 rounded-xl border border-white/[0.08] px-4 py-3 text-sm font-semibold text-white/68"
            >
              Official results
            </Link>
          </div>
        </>
      )}
    </V3Screen>
  );
}
