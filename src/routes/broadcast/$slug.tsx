import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { FlagChip } from "@/components/FlagChip";
import { Scoreboard } from "@/components/Scoreboard";
import { computeStandings } from "@/lib/analysis";
import {
  POINT_SET,
  useCountries,
  useEdition,
  useJuryVotes,
  useParticipants,
  useTelevotes,
  type Country,
  type JuryVote,
  type Televote,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/broadcast/$slug")({
  head: () => ({
    meta: [
      { title: "Live broadcast mode — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "Full-screen animated Solaris Song Contest results show: jury sequence, televote reveal and winner animation.",
      },
      { property: "og:title", content: "Live broadcast mode — Solaris Scoreboard Studio" },
      {
        property: "og:description",
        content: "Run the SSC results show with animated jury and televote reveals.",
      },
    ],
  }),
  component: BroadcastPage,
});

type Step =
  | { kind: "opening" }
  | { kind: "jury"; voter: string; receiver: string; points: number }
  | { kind: "tele"; country: string; points: number }
  | { kind: "winner" };

type RevealMode = "lowest-jury-up" | "running-order" | "reverse-order";

const MODE_LABEL: Record<RevealMode, string> = {
  "lowest-jury-up": "Eurovision style · lowest jury first",
  "running-order": "Country by country",
  "reverse-order": "Custom · reverse order",
};

function buildSteps(
  order: string[],
  jury: JuryVote[],
  tele: Televote[],
  mode: RevealMode,
): Step[] {
  const steps: Step[] = [{ kind: "opening" }];
  order.forEach((voter) => {
    const votes = jury
      .filter((v) => v.voter_country_id === voter)
      .sort((a, b) => a.points - b.points);
    votes.forEach((v) =>
      steps.push({ kind: "jury", voter, receiver: v.receiving_country_id, points: v.points }),
    );
  });

  const juryTotals = new Map<string, number>();
  order.forEach((id) => juryTotals.set(id, 0));
  jury.forEach((v) =>
    juryTotals.set(v.receiving_country_id, (juryTotals.get(v.receiving_country_id) ?? 0) + v.points),
  );

  let teleOrder = [...order];
  if (mode === "lowest-jury-up")
    teleOrder = [...order].sort((a, b) => (juryTotals.get(a) ?? 0) - (juryTotals.get(b) ?? 0));
  if (mode === "reverse-order") teleOrder = [...order].reverse();

  teleOrder.forEach((countryId) => {
    const t = tele.find((x) => x.country_id === countryId);
    steps.push({ kind: "tele", country: countryId, points: t?.points ?? 0 });
  });
  steps.push({ kind: "winner" });
  return steps;
}

function BroadcastPage() {
  const { slug } = Route.useParams();
  const { data: edition } = useEdition(slug);
  const { data: countries } = useCountries();
  const { data: participants } = useParticipants(edition?.id);
  const { data: jury } = useJuryVotes(edition?.id);
  const { data: tele } = useTelevotes(edition?.id);

  const [mode, setMode] = useState<RevealMode>("lowest-jury-up");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1200);
  const stageRef = useRef<HTMLDivElement>(null);

  const cMap = useMemo(() => new Map((countries ?? []).map((c) => [c.id, c])), [countries]);
  const order = useMemo(
    () =>
      [...(participants ?? [])]
        .sort((a, b) => (a.running_order ?? 0) - (b.running_order ?? 0))
        .map((p) => p.country_id),
    [participants],
  );
  const steps = useMemo(
    () => buildSteps(order, jury ?? [], tele ?? [], mode),
    [order, jury, tele, mode],
  );

  const current = steps[index] ?? { kind: "opening" as const };
  const applied = steps.slice(0, index + 1);
  const juryApplied = applied.filter((s): s is Extract<Step, { kind: "jury" }> => s.kind === "jury");
  const teleApplied = applied.filter((s): s is Extract<Step, { kind: "tele" }> => s.kind === "tele");

  const standings = useMemo(
    () =>
      computeStandings(
        order,
        juryApplied.map((s, i) => ({
          id: String(i),
          edition_id: "",
          voter_country_id: s.voter,
          receiving_country_id: s.receiver,
          points: s.points,
        })),
        teleApplied.map((s, i) => ({
          id: String(i),
          edition_id: "",
          country_id: s.country,
          points: s.points,
        })),
      ),
    [order, juryApplied, teleApplied],
  );

  const awarded =
    current.kind === "jury"
      ? { [current.receiver]: current.points }
      : current.kind === "tele"
        ? { [current.country]: current.points }
        : undefined;

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), [steps.length]);
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  useEffect(() => {
    if (!playing) return;
    if (index >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const delay = current.kind === "jury" && current.points === 12 ? speed * 1.8 : speed;
    const t = setTimeout(next, delay);
    return () => clearTimeout(t);
  }, [playing, index, steps.length, speed, next, current]);

  useEffect(() => {
    if (current.kind === "winner") {
      confetti({ particleCount: 220, spread: 100, origin: { y: 0.35 }, ticks: 260 });
      const t = setTimeout(
        () => confetti({ particleCount: 160, spread: 130, origin: { y: 0.5 } }),
        700,
      );
      return () => clearTimeout(t);
    }
  }, [current.kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next]);

  const skipCountry = () => {
    if (current.kind !== "jury") return next();
    const voter = current.voter;
    let i = index;
    while (i < steps.length - 1) {
      const s = steps[i + 1];
      if (s.kind === "jury" && s.voter === voter) i++;
      else break;
    }
    setIndex(i);
  };

  const jumpTo = (countryId: string) => {
    const i = steps.findIndex((s) => s.kind === "jury" && s.voter === countryId);
    if (i >= 0) setIndex(i);
  };

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const voterCountry =
    current.kind === "jury" ? cMap.get(current.voter) : undefined;
  const teleCountry = current.kind === "tele" ? cMap.get(current.country) : undefined;
  const winner = cMap.get(standings[0]?.countryId ?? "");
  const juryDone = steps.filter((s) => s.kind === "jury").length === juryApplied.length;

  return (
    <div ref={stageRef} className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-4 py-4">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <Link to="/editions/$slug" params={{ slug }} className="text-sm text-muted-foreground hover:text-foreground">
            ← Exit broadcast
          </Link>
          <span className="font-display text-sm font-semibold">{edition?.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            Step {index + 1} / {steps.length} · {juryDone ? "Televote" : "Jury"} phase
          </span>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          {/* STAGE */}
          <section className="glass-strong relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden p-8">
            <AnimatePresence mode="wait">
              {current.kind === "opening" && (
                <motion.div
                  key="opening"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="text-center"
                >
                  <div className="bg-aurora glow-ring mx-auto mb-6 grid h-28 w-28 place-items-center rounded-3xl font-display text-3xl font-bold text-primary-foreground">
                    SSC
                  </div>
                  <h1 className="font-display text-4xl font-bold">{edition?.name}</h1>
                  <p className="mt-2 text-muted-foreground">
                    {edition?.host_city} · {edition?.year}
                  </p>
                  <motion.p
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2.2 }}
                    className="text-aurora mt-8 font-display text-2xl font-semibold"
                  >
                    The voting begins
                  </motion.p>
                  <p className="mt-6 text-[11px] uppercase tracking-widest text-muted-foreground">
                    ♪ theme music placeholder
                  </p>
                </motion.div>
              )}

              {current.kind === "jury" && voterCountry && (
                <motion.div
                  key={`jury-${index}`}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  className="w-full text-center"
                >
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Jury of</p>
                  <div className="mt-4 flex flex-col items-center gap-3">
                    <FlagChip code={voterCountry.short_code} color={voterCountry.accent_color} size="xl" />
                    <h2 className="font-display text-3xl font-bold">{voterCountry.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      Spokesperson · live from {voterCountry.name}
                    </p>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
                    {POINT_SET.map((p) => {
                      const given = juryApplied.some(
                        (s) => s.voter === current.voter && s.points === p,
                      );
                      return (
                        <span
                          key={p}
                          className={cn(
                            "numeric grid h-9 w-9 place-items-center rounded-lg text-sm font-semibold",
                            given ? "bg-aurora text-primary-foreground" : "bg-surface text-muted-foreground",
                            current.points === p && "scale-125 ring-2 ring-primary",
                          )}
                        >
                          {p}
                        </span>
                      );
                    })}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`award-${index}`}
                      initial={{ scale: current.points === 12 ? 0.4 : 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 16 }}
                      className="mt-8"
                    >
                      <p
                        className={cn(
                          "numeric font-display font-bold",
                          current.points === 12 ? "text-gold-grad text-7xl" : "text-aurora text-5xl",
                        )}
                      >
                        {current.points}
                      </p>
                      <p className="mt-2 text-lg">
                        points to{" "}
                        <span className="font-semibold">{cMap.get(current.receiver)?.name}</span>
                      </p>
                      {current.points === 12 && (
                        <p className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                          ♪ douze points sting placeholder
                        </p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              )}

              {current.kind === "tele" && teleCountry && (
                <motion.div
                  key={`tele-${index}`}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.04 }}
                  className="text-center"
                >
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--televote)]">
                    Televote result
                  </p>
                  <div className="mt-5 flex flex-col items-center gap-3">
                    <FlagChip code={teleCountry.short_code} color={teleCountry.accent_color} size="xl" />
                    <h2 className="font-display text-3xl font-bold">{teleCountry.name}</h2>
                  </div>
                  <motion.p
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.25 }}
                    className="numeric text-gold-grad mt-8 font-display text-7xl font-bold"
                  >
                    {current.points}
                  </motion.p>
                  <p className="mt-2 text-sm text-muted-foreground">points from the Terra Solaris public</p>
                </motion.div>
              )}

              {current.kind === "winner" && winner && (
                <motion.div
                  key="winner"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center"
                >
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    The winner of the {edition?.name}
                  </p>
                  <div className="mt-6 flex flex-col items-center gap-4">
                    <FlagChip code={winner.short_code} color={winner.accent_color} size="xl" className="scale-125" />
                    <h2 className="text-gold-grad font-display text-5xl font-bold">{winner.name}</h2>
                    <p className="numeric text-2xl font-semibold">{standings[0].total} points</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* LEADERBOARD */}
          <section className="glass scroll-slim max-h-[78vh] overflow-y-auto p-4">
            <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-muted-foreground">
              Leaderboard
            </h2>
            <Scoreboard standings={standings} countries={cMap as Map<string, Country>} awarded={awarded} compact />
          </section>
        </div>

        {/* CONTROLS */}
        <footer className="glass mt-4 flex flex-wrap items-center gap-2 p-3">
          <button onClick={prev} className="rounded-lg bg-surface px-3 py-2 text-sm hover:bg-surface-strong">
            ◀ Previous
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="bg-aurora rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button onClick={next} className="rounded-lg bg-surface px-3 py-2 text-sm hover:bg-surface-strong">
            Next ▶
          </button>
          <button onClick={skipCountry} className="rounded-lg bg-surface px-3 py-2 text-sm hover:bg-surface-strong">
            Skip country
          </button>
          <button
            onClick={() => setIndex(steps.length - 1)}
            className="rounded-lg bg-surface px-3 py-2 text-sm hover:bg-surface-strong"
          >
            Skip to result
          </button>
          <button onClick={() => setIndex(0)} className="rounded-lg bg-surface px-3 py-2 text-sm hover:bg-surface-strong">
            Restart
          </button>

          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as RevealMode);
              setPlaying(false);
            }}
            className="rounded-lg bg-surface px-3 py-2 text-sm"
          >
            {Object.entries(MODE_LABEL).map(([k, v]) => (
              <option key={k} value={k} className="bg-background">
                {v}
              </option>
            ))}
          </select>

          <select
            onChange={(e) => e.target.value && jumpTo(e.target.value)}
            value=""
            className="rounded-lg bg-surface px-3 py-2 text-sm"
          >
            <option value="" className="bg-background">
              Jump to country…
            </option>
            {order.map((id) => (
              <option key={id} value={id} className="bg-background">
                {cMap.get(id)?.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Speed
            <input
              type="range"
              min={300}
              max={2500}
              step={100}
              value={2800 - speed}
              onChange={(e) => setSpeed(2800 - Number(e.target.value))}
            />
          </label>

          <button
            onClick={toggleFullscreen}
            className="ml-auto rounded-lg bg-surface px-3 py-2 text-sm hover:bg-surface-strong"
          >
            Fullscreen
          </button>
        </footer>
      </div>
    </div>
  );
}
