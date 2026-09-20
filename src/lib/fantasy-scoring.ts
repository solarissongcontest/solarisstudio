export const FANTASY_SCORING_VERSION = "v1" as const;

export type FantasyScoringInput = {
  rank: number | null;
  juryPoints: number;
  televotePoints: number;
  qualified: boolean | null;
  captain?: boolean;
  captainMultiplier?: number;
};

export type FantasyScoreBreakdown = {
  placement: number;
  jury: number;
  televote: number;
  qualification: number;
  subtotal: number;
  multiplier: number;
  total: number;
  version: typeof FANTASY_SCORING_VERSION;
};

export function scoreFantasyEntry(input: FantasyScoringInput): FantasyScoreBreakdown {
  const placement = input.rank == null ? 0 : Math.max(0, 26 - input.rank);
  const jury = Math.max(0, Math.floor(input.juryPoints / 20));
  const televote = Math.max(0, Math.floor(input.televotePoints / 20));
  const qualification = input.qualified === true ? 8 : 0;
  const subtotal = placement + jury + televote + qualification;
  const multiplier = input.captain ? Math.max(1, input.captainMultiplier ?? 2) : 1;

  return {
    placement,
    jury,
    televote,
    qualification,
    subtotal,
    multiplier,
    total: subtotal * multiplier,
    version: FANTASY_SCORING_VERSION,
  };
}
