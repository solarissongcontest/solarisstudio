export type V3FantasyGame = {
  id: string;
  edition_id: string;
  show_id: string;
  name: string;
  opens_at: string;
  locks_at: string;
  status: string;
  roster_size: number;
  budget: number;
  captain_multiplier: number;
  scoring_version: string;
};

export type V3FantasyChoice = {
  game_id: string;
  country_id: string;
  cost: number;
  eligible: boolean;
};

export type V3FantasyTeam = {
  id: string;
  game_id: string;
  profile_id: string;
  state: string;
  captain_country_id: string | null;
  score: number | null;
};

export type V3FantasyTeamEntry = {
  team_id: string;
  country_id: string;
  cost_locked: number;
};

export type V3FantasyStanding = {
  position: number;
  displayName: string;
  score: number;
  profileId: string;
};

export type V3FantasyState =
  | "unavailable"
  | "upcoming"
  | "open"
  | "submitted"
  | "locked"
  | "live_scoring"
  | "settled";

export function resolveV3FantasyState(input: {
  game: V3FantasyGame | null;
  team: V3FantasyTeam | null;
  nowMs: number;
}): V3FantasyState {
  const { game, team, nowMs } = input;
  if (!game || game.status === "cancelled") return "unavailable";

  const opensAt = Date.parse(game.opens_at);
  const locksAt = Date.parse(game.locks_at);
  if (Number.isFinite(opensAt) && nowMs < opensAt) return "upcoming";
  if (game.status === "scored" || team?.state === "scored") return "settled";
  if (game.status === "scoring") return "live_scoring";
  if (
    game.status === "locked" ||
    team?.state === "locked" ||
    (Number.isFinite(locksAt) && nowMs >= locksAt)
  ) {
    return "locked";
  }
  if (team) return "submitted";
  return "open";
}

export function restoreV3FantasyRoster(
  team: V3FantasyTeam | null | undefined,
  entries: readonly V3FantasyTeamEntry[] | null | undefined,
) {
  if (!team) return { selected: [] as string[], captain: "" };
  return {
    selected: (entries ?? []).map((entry) => entry.country_id),
    captain: team.captain_country_id ?? "",
  };
}

export function fantasyBudgetUsed(
  selected: readonly string[],
  choices: readonly V3FantasyChoice[],
) {
  const costByCountry = new Map(choices.map((choice) => [choice.country_id, choice.cost]));
  return selected.reduce((sum, countryId) => sum + (costByCountry.get(countryId) ?? 0), 0);
}

export function fantasyRosterReady(input: {
  game: V3FantasyGame;
  selected: readonly string[];
  choices: readonly V3FantasyChoice[];
}) {
  return (
    input.selected.length === input.game.roster_size &&
    fantasyBudgetUsed(input.selected, input.choices) <= input.game.budget
  );
}

export function fantasyStateLabel(state: V3FantasyState) {
  if (state === "upcoming") return "Upcoming";
  if (state === "open") return "Open";
  if (state === "submitted") return "Saved";
  if (state === "locked") return "Locked";
  if (state === "live_scoring") return "Live scoring";
  if (state === "settled") return "Settled";
  return "Unavailable";
}

export function canEditV3FantasyRoster(state: V3FantasyState) {
  return state === "open" || state === "submitted";
}
