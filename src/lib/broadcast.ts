/**
 * Broadcast / TV scene configuration and the reveal step sequencer.
 */

export type SceneKind = "opening" | "recap" | "jury" | "televote" | "winner" | "credits";

export type BroadcastConfig = {
  speed: number; // global multiplier 0.25 – 2
  pointDelay: number; // ms between individual point drops
  spokespersonDelay: number; // ms pause between voting countries
  topPointHold: number; // extra hold on the highest award
  televoteHold: number; // ms per televote reveal
  scenes: Record<SceneKind, boolean>;
  openingTitle: string;
  openingSubtitle: string;
  creditsText: string;
  effects: {
    pointAnim: "slide" | "fade" | "scale" | "bounce";
    topPoint: "glow" | "flash" | "pulse" | "none";
    winner: "confetti" | "fireworks" | "none";
    shakeOnLead: boolean;
  };
  spokesperson: { show: boolean; size: "sm" | "md" | "lg" };
  showRunningTotals: boolean;
};

export const DEFAULT_BROADCAST: BroadcastConfig = {
  speed: 1,
  pointDelay: 620,
  spokespersonDelay: 1400,
  topPointHold: 1600,
  televoteHold: 2000,
  scenes: { opening: true, recap: true, jury: true, televote: true, winner: true, credits: true },
  openingTitle: "",
  openingSubtitle: "",
  creditsText: "Solaris Spectacle Suite",
  effects: { pointAnim: "slide", topPoint: "glow", winner: "confetti", shakeOnLead: false },
  spokesperson: { show: true, size: "md" },
  showRunningTotals: true,
};

export function resolveBroadcast(raw: unknown): BroadcastConfig {
  const b = (raw ?? {}) as Partial<BroadcastConfig>;
  return {
    ...DEFAULT_BROADCAST,
    ...b,
    scenes: { ...DEFAULT_BROADCAST.scenes, ...(b.scenes ?? {}) },
    effects: { ...DEFAULT_BROADCAST.effects, ...(b.effects ?? {}) },
    spokesperson: { ...DEFAULT_BROADCAST.spokesperson, ...(b.spokesperson ?? {}) },
  };
}

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/* ---------------- step sequencer ---------------- */

import type { JuryVote, Televote } from "./data";
import type { VotingConfig } from "./voting";

export type Step =
  | { kind: "opening" }
  | { kind: "recap" }
  | { kind: "jury-intro"; voter: string }
  | { kind: "jury-point"; voter: string; to: string; points: number; isTop: boolean }
  | { kind: "jury-done" }
  | { kind: "televote-intro" }
  | { kind: "televote"; to: string; points: number; rank: number }
  | { kind: "winner"; countryId: string }
  | { kind: "credits" };

export function buildSteps(
  cfg: BroadcastConfig,
  voting: VotingConfig,
  jury: JuryVote[],
  tele: Televote[],
  order: string[],
  juryTotals: Map<string, number>,
): Step[] {
  const steps: Step[] = [];
  if (cfg.scenes.opening) steps.push({ kind: "opening" });
  if (cfg.scenes.recap) steps.push({ kind: "recap" });

  const top = voting.juryPoints[0] ?? 12;
  if (cfg.scenes.jury && voting.juryEnabled) {
    const voters = order.length
      ? order
      : [...new Set(jury.map((v) => v.voter_country_id))];
    voters.forEach((voter) => {
      const votes = jury
        .filter((v) => v.voter_country_id === voter)
        .sort((a, b) => a.points - b.points);
      if (!votes.length) return;
      steps.push({ kind: "jury-intro", voter });
      votes.forEach((v) =>
        steps.push({
          kind: "jury-point",
          voter,
          to: v.receiving_country_id,
          points: v.points,
          isTop: v.points === top,
        }),
      );
    });
    steps.push({ kind: "jury-done" });
  }

  if (cfg.scenes.televote && voting.televoteEnabled) {
    steps.push({ kind: "televote-intro" });
    // Televote is revealed lowest jury total first (classic dramatic order).
    const totals = new Map<string, number>();
    tele.forEach((t) => totals.set(t.country_id, (totals.get(t.country_id) ?? 0) + t.points));
    const ids = [...totals.keys()].sort(
      (a, b) => (juryTotals.get(a) ?? 0) - (juryTotals.get(b) ?? 0),
    );
    ids.forEach((id, i) =>
      steps.push({ kind: "televote", to: id, points: totals.get(id) ?? 0, rank: i + 1 }),
    );
  }

  if (cfg.scenes.winner) steps.push({ kind: "winner", countryId: "" });
  if (cfg.scenes.credits) steps.push({ kind: "credits" });
  return steps;
}

export function stepDuration(step: Step, cfg: BroadcastConfig): number {
  const s = 1 / Math.max(0.1, cfg.speed);
  switch (step.kind) {
    case "opening":
      return 3400 * s;
    case "recap":
      return 3000 * s;
    case "jury-intro":
      return cfg.spokespersonDelay * s;
    case "jury-point":
      return (step.isTop ? cfg.pointDelay + cfg.topPointHold : cfg.pointDelay) * s;
    case "jury-done":
      return 2200 * s;
    case "televote-intro":
      return 2600 * s;
    case "televote":
      return cfg.televoteHold * s;
    case "winner":
      return 9000 * s;
    case "credits":
      return 8000 * s;
  }
}
