"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ScoreboardStage } from "@/components/ScoreboardStage";
import { computeStandings } from "@/lib/analysis";
import {
  useAllContestEntities,
  useCountries,
  useJuryVotes,
  useShow,
  useShowParticipants,
  useTelevotes,
  useThemes,
} from "@/lib/data";
import { backgroundStyle, resolveTheme, themeVars } from "@/lib/theme";
import { resolveVoting } from "@/lib/voting";
import { buildSteps, resolveBroadcast, SPEEDS, stepDuration } from "@/lib/broadcast";
import { cn } from "@/lib/utils";
import { entityDisplayMap } from "@/lib/entities";

export const Route = createFileRoute("/broadcast/$showId")({
  head: () => ({
    meta: [
      { title: "Broadcast — Solaris Spectacle Suite" },
      { name: "description", content: "Full-screen animated results reveal with jury spokespersons, televote climb and winner celebration." },
      { property: "og:title", content: "SSC broadcast" },
      { property: "og:description", content: "Watch the animated results reveal." },
    ],
  }),
  component: BroadcastPage,
});

function BroadcastPage() {
  const { showId } = Route.useParams();
  const { data: show } = useShow(showId);
  const { data: participants } = useShowParticipants(showId);
  const { data: jury } = useJuryVotes(showId);
  const { data: tele } = useTelevotes(showId);
  const { data: countries } = useCountries();
  const { data: entities } = useAllContestEntities();
  const { data: themes } = useThemes();

  const theme = useMemo(
    () => resolveTheme((themes ?? []).find((t) => t.id === show?.theme_id)?.config),
    [themes, show?.theme_id],
  );
  const voting = useMemo(() => resolveVoting(show?.voting_config), [show?.voting_config]);
  const baseCast = useMemo(() => resolveBroadcast(show?.broadcast_config), [show?.broadcast_config]);

  const [speed, setSpeed] = useState(1);
  const cast = { ...baseCast, speed };
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolves both global countries and edition-only custom nations.
  const countryMap = entityDisplayMap(entities, countries);
  const participantMap = new Map((participants ?? []).map((p) => [p.country_id, p]));
  const ids = (participants ?? []).map((p) => p.country_id);

  const juryTotals = useMemo(() => {
    const m = new Map<string, number>();
    (jury ?? []).forEach((v) => m.set(v.receiving_country_id, (m.get(v.receiving_country_id) ?? 0) + v.points));
    return m;
  }, [jury]);

  const steps = useMemo(
    () =>
      buildSteps(
        cast,
        voting,
        jury ?? [],
        tele ?? [],
        voting.votingOrder.length ? voting.votingOrder : ids,
        juryTotals,
        theme.reveal.juryPresentation,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jury, tele, voting, baseCast, ids.join(","), theme.reveal.juryPresentation],
  );

  const step = steps[i];

  useEffect(() => {
    if (!playing || !step) return;
    timer.current = setTimeout(() => setI((n) => Math.min(n + 1, steps.length - 1)), stepDuration(step, cast));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, i, steps.length, speed]);

  // votes applied up to the current step
  const applied = useMemo(() => {
    const j: typeof jury = [] as never;
    const t: typeof tele = [] as never;
    const juryApplied: NonNullable<typeof jury> = [];
    const teleApplied: NonNullable<typeof tele> = [];
    for (let k = 0; k <= i && k < steps.length; k++) {
      const s = steps[k];
      if (s.kind === "jury-point")
        juryApplied.push({
          id: `${k}`,
          edition_id: "",
          show_id: showId,
          voter_country_id: s.voter,
          receiving_country_id: s.to,
          points: s.points,
        });
      if (s.kind === "jury-batch")
        s.entries.forEach((e, ei) =>
          juryApplied.push({
            id: `${k}-${ei}`,
            edition_id: "",
            show_id: showId,
            voter_country_id: s.voter,
            receiving_country_id: e.to,
            points: e.points,
          }),
        );
      if (s.kind === "televote")
        teleApplied.push({ id: `t${k}`, edition_id: "", show_id: showId, country_id: s.to, points: s.points });
    }
    void j;
    void t;
    return { juryApplied, teleApplied };
  }, [i, steps, showId]);

  const standings = computeStandings(ids, applied.juryApplied, applied.teleApplied, voting);
  const awarded: Record<string, number> = {};
  if (step?.kind === "jury-point") awarded[step.to] = step.points;
  if (step?.kind === "jury-batch") step.entries.forEach((e) => (awarded[e.to] = e.points));
  if (step?.kind === "televote") awarded[step.to] = step.points;

  const isWinnerStep = step?.kind === "winner";
  useEffect(() => {
    if (isWinnerStep && cast.effects.winner !== "none") {
      confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 } });
    }
  }, [isWinnerStep]);

  if (!show)
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-sm text-muted-foreground">This show is private or unavailable.</p>
      </div>
    );

  const winner = standings[0] ? countryMap.get(standings[0].countryId) : null;
  const voter =
    step?.kind === "jury-intro" || step?.kind === "jury-point" || step?.kind === "jury-batch"
      ? countryMap.get(step.voter)
      : null;

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ ...backgroundStyle(theme), ...themeVars(theme) }}>
      <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${theme.background.overlay})` }} />

      <div className="relative mx-auto max-w-6xl px-4 py-6">
        <header
          className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: "var(--t-header-bg)", color: "var(--t-header-text)" }}
        >
          <Link to="/shows/$showId" params={{ showId }} className="text-xs opacity-70 hover:opacity-100">
            ← Back to show
          </Link>
          <h1 className="font-display text-lg font-bold" style={{ fontFamily: "var(--t-font-display)" }}>
            {show.name}
          </h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => setI((n) => Math.max(0, n - 1))}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs"
            >
              Prev
            </button>
            <button
              onClick={() => setI((n) => Math.min(steps.length - 1, n + 1))}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs"
            >
              Next
            </button>
            <button onClick={() => { setI(0); setPlaying(false); }} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs">
              Replay
            </button>
            <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn("numeric rounded px-1.5 py-0.5 text-[10px]", speed === s && "bg-white/25")}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="mb-4 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--t-progress-track)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${steps.length ? ((i + 1) / steps.length) * 100 : 0}%`,
              background: "var(--t-progress-fill)",
            }}
          />
        </div>

        {step?.kind === "opening" && (
          <Splash title={cast.openingTitle || show.name} subtitle={cast.openingSubtitle || "Good evening, Terra Solaris!"} />
        )}
        {step?.kind === "credits" && <Splash title="Thank you" subtitle={cast.creditsText} />}

        {isWinnerStep && winner && (
          <Splash title={winner.name} subtitle={`Winner with ${standings[0].total} points`} />
        )}

        {!["opening", "credits", "winner"].includes(step?.kind ?? "") && (
          <>
            {voter && cast.spokesperson.show && (
              <motion.div
                key={voter.id}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur"
                style={{ background: "var(--t-spokesperson-bg)", color: "var(--t-spokesperson-text)" }}
              >
                {voter.flag_image && (
                  <img src={voter.flag_image} alt={voter.name} className="h-10 w-15 rounded object-cover" />
                )}
                <div>
                  <p className="text-[11px] uppercase tracking-widest" style={{ color: "var(--t-spokesperson-accent)", opacity: 0.9 }}>
                    Now voting
                  </p>
                  <p className="font-display text-lg font-bold">{voter.name}</p>
                </div>
              </motion.div>
            )}
            {step?.kind === "televote-intro" && (
              <p className="mb-4 text-center font-display text-xl font-bold">And now… the televote!</p>
            )}
            <ScoreboardStage
              theme={theme}
              standings={standings}
              countries={countryMap}
              participants={participantMap}
              awarded={awarded}
              votingCountryId={voter?.id ?? null}
              qualifiers={show.qualifier_count}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Splash({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="grid min-h-[60vh] place-items-center text-center"
    >
      <div>
        <h2 className="font-display text-5xl font-black" style={{ fontFamily: "var(--t-font-display)" }}>
          {title}
        </h2>
        <p className="mt-3 text-lg opacity-75">{subtitle}</p>
      </div>
    </motion.div>
  );
}
