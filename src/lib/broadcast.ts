/**
 * Broadcast / TV scene configuration and the reveal step sequencer.
 */

export type SceneKind =
  | "opening"
  | "recap"
  | "jury"
  | "televote"
  | "winner"
  | "credits";

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

  spokesperson: {
    show: boolean;
    size: "sm" | "md" | "lg";
  };

  showRunningTotals: boolean;
};

export const DEFAULT_BROADCAST: BroadcastConfig = {
  speed: 1,
  pointDelay: 620,
  spokespersonDelay: 1400,
  topPointHold: 1600,
  televoteHold: 2000,

  scenes: {
    opening: true,
    recap: true,
    jury: true,
    televote: true,
    winner: true,
    credits: true,
  },

  openingTitle: "",
  openingSubtitle: "",
  creditsText: "Solaris Spectacle Suite",

  effects: {
    pointAnim: "slide",
    topPoint: "glow",
    winner: "confetti",
    shakeOnLead: false,
  },

  spokesperson: {
    show: true,
    size: "md",
  },

  showRunningTotals: true,
};

export function resolveBroadcast(raw: unknown): BroadcastConfig {
  const b = (raw ?? {}) as Partial<BroadcastConfig>;

  return {
    ...DEFAULT_BROADCAST,
    ...b,

    scenes: {
      ...DEFAULT_BROADCAST.scenes,
      ...(b.scenes ?? {}),
    },

    effects: {
      ...DEFAULT_BROADCAST.effects,
      ...(b.effects ?? {}),
    },

    spokesperson: {
      ...DEFAULT_BROADCAST.spokesperson,
      ...(b.spokesperson ?? {}),
    },
  };
}

export const SPEEDS = [
  0.25,
  0.5,
  0.75,
  1,
  1.25,
  1.5,
  2,
] as const;

/* -------------------------------------------------------------------------- */
/* Step sequencer                                                             */
/* -------------------------------------------------------------------------- */

import type { JuryVote, Televote } from "./data";
import type { VotingConfig } from "./voting";

export type Step =
  | {
      kind: "opening";
    }
  | {
      kind: "recap";
    }
  | {
      kind: "jury-intro";
      voter: string;
    }
  | {
      kind: "jury-point";
      voter: string;
      to: string;
      points: number;
      isTop: boolean;
    }
  | {
      kind: "jury-batch";
      voter: string;
      entries: {
        to: string;
        points: number;
      }[];
    }
  | {
      kind: "jury-done";
    }
  | {
      kind: "televote-intro";
    }
  | {
      kind: "televote";
      to: string;
      points: number;
      rank: number;
    }
  | {
      kind: "winner";
      countryId: string;
    }
  | {
      kind: "credits";
    };

/**
 * Build the complete broadcast reveal sequence.
 *
 * Important:
 *
 * `voter` is now a CANONICAL VOTER KEY rather than being assumed
 * to always equal voter_country_id.
 *
 * Examples:
 *
 * v:1234...   registered voter row
 * c:abcd...   legacy country voter
 *
 * This allows:
 *
 * - participating country juries
 * - non-participating countries
 * - external-country juries
 * - organisations
 * - people
 * - custom voters
 *
 * while remaining backwards compatible with legacy country-only ballots.
 */
export function buildSteps(
  cfg: BroadcastConfig,
  voting: VotingConfig,
  jury: JuryVote[],
  tele: Televote[],
  order: string[],
  juryTotals: Map<string, number>,
  juryPresentation:
    | "all-individually"
    | "top3-individually"
    | "twelve-only" = "all-individually",

  voterKeyForVote: (vote: JuryVote) => string = (vote) =>
    vote.voter_country_id,
): Step[] {
  const steps: Step[] = [];

  if (cfg.scenes.opening) {
    steps.push({
      kind: "opening",
    });
  }

  if (cfg.scenes.recap) {
    steps.push({
      kind: "recap",
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Jury                                                                     */
  /* ------------------------------------------------------------------------ */

  const top = voting.juryPoints[0] ?? 12;

  if (cfg.scenes.jury && voting.juryEnabled) {
    /**
     * IMPORTANT:
     *
     * Previously this was effectively based only on voter_country_id
     * and the participant list.
     *
     * It now uses canonical voter keys.
     */
    const voters =
      order.length > 0
        ? order
        : [
            ...new Set(
              jury
                .map((vote) => voterKeyForVote(vote))
                .filter((key): key is string => Boolean(key)),
            ),
          ];

    voters.forEach((voter) => {
      /**
       * Match ballots using the SAME canonical identity
       * used to build the voting order.
       */
      const votes = jury
        .filter((vote) => voterKeyForVote(vote) === voter)
        .sort((a, b) => a.points - b.points);

      /**
       * A configured voter may not have submitted a ballot.
       * In that case they simply do not receive a reveal.
       */
      if (!votes.length) {
        return;
      }

      steps.push({
        kind: "jury-intro",
        voter,
      });

      const individualCount =
        juryPresentation === "all-individually"
          ? votes.length
          : juryPresentation === "top3-individually"
            ? 3
            : 1;

      const individualStart = Math.max(
        0,
        votes.length - individualCount,
      );

      const batch = votes.slice(
        0,
        individualStart,
      );

      const individual = votes.slice(
        individualStart,
      );

      if (batch.length > 0) {
        steps.push({
          kind: "jury-batch",
          voter,

          entries: batch.map((vote) => ({
            to: vote.receiving_country_id,
            points: vote.points,
          })),
        });
      }

      individual.forEach((vote) => {
        steps.push({
          kind: "jury-point",
          voter,
          to: vote.receiving_country_id,
          points: vote.points,
          isTop: vote.points === top,
        });
      });
    });

    steps.push({
      kind: "jury-done",
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Televote                                                                 */
  /* ------------------------------------------------------------------------ */

  if (
    cfg.scenes.televote &&
    voting.televoteEnabled
  ) {
    steps.push({
      kind: "televote-intro",
    });

    const totals = new Map<string, number>();

    tele.forEach((vote) => {
      totals.set(
        vote.country_id,
        (totals.get(vote.country_id) ?? 0) +
          vote.points,
      );
    });

    /**
     * Classic dramatic televote order:
     *
     * lowest jury total receives televote first.
     */
    const ids = [...totals.keys()].sort(
      (a, b) =>
        (juryTotals.get(a) ?? 0) -
        (juryTotals.get(b) ?? 0),
    );

    ids.forEach((id, index) => {
      steps.push({
        kind: "televote",
        to: id,
        points: totals.get(id) ?? 0,
        rank: index + 1,
      });
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Winner / credits                                                         */
  /* ------------------------------------------------------------------------ */

  if (cfg.scenes.winner) {
    steps.push({
      kind: "winner",
      countryId: "",
    });
  }

  if (cfg.scenes.credits) {
    steps.push({
      kind: "credits",
    });
  }

  return steps;
}

/* -------------------------------------------------------------------------- */
/* Step timing                                                                */
/* -------------------------------------------------------------------------- */

export function stepDuration(
  step: Step,
  cfg: BroadcastConfig,
): number {
  const speedMultiplier =
    1 / Math.max(0.1, cfg.speed);

  switch (step.kind) {
    case "opening":
      return 3400 * speedMultiplier;

    case "recap":
      return 3000 * speedMultiplier;

    case "jury-intro":
      return (
        cfg.spokespersonDelay *
        speedMultiplier
      );

    case "jury-point":
      return (
        (step.isTop
          ? cfg.pointDelay +
            cfg.topPointHold
          : cfg.pointDelay) *
        speedMultiplier
      );

    case "jury-batch":
      return (
        (cfg.pointDelay + 400) *
        speedMultiplier
      );

    case "jury-done":
      return 2200 * speedMultiplier;

    case "televote-intro":
      return 2600 * speedMultiplier;

    case "televote":
      return (
        cfg.televoteHold *
        speedMultiplier
      );

    case "winner":
      return 9000 * speedMultiplier;

    case "credits":
      return 8000 * speedMultiplier;
  }
}
