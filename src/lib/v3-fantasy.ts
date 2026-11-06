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

/** Validate an entire published leaderboard before rendering any ranking. */
export function normalizeV3FantasyStandings(payload: unknown): V3FantasyStanding[] {
  if (!Array.isArray(payload)) throw new Error("Invalid Fantasy leaderboard response.");

  const identities = new Set<string>();
  return payload.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid Fantasy standing.");
    }

    const row = value as Record<string, unknown>;
    // PostgreSQL numeric columns can arrive as decimal strings through RPC.
    const toNumber = (input: unknown): number => {
      if (typeof input === "number") return input;
      if (typeof input !== "string" ||
          !/^-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$/.test(input.trim())) {
        return Number.NaN;
      }
      return Number(input.trim());
    };
    const score = toNumber(row.score);
    const position = toNumber(row.position);
    const profileId = row.profileId;
    const displayName = row.displayName;

    if (
      typeof profileId !== "string" || !profileId.trim() ||
      typeof displayName !== "string" || !displayName.trim() ||
      !Number.isFinite(score) || score < 0 ||
      !Number.isSafeInteger(position) || position < 1 ||
      identities.has(profileId)
    ) {
      throw new Error("Invalid Fantasy standing.");
    }
    identities.add(profileId);
    return { profileId, displayName, score, position };
  });
}

export type V3FantasyState =
  | "unavailable"
  | "upcoming"
  | "open"
  | "submitted"
  | "locked"
  | "live_scoring"
  | "settled";

/**
 * A team can be scored before the server finishes scoring the entire game.
 * Never reveal a partially written score merely because one team says "scored".
 * The canonical scoring command only marks a game scored after results publication.
 */
export function canShowV3FantasyTeamScore(
  game: V3FantasyGame | null,
  team: V3FantasyTeam | null,
): boolean {
  return Boolean(
    game?.status === "scored" &&
    team?.game_id === game.id &&
    team.state === "scored" &&
    typeof team.score === "number" &&
    Number.isFinite(team.score),
  );
}

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
  if (game.status === "scored") return "settled";
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

/**
 * Keep a user's unsaved roster through background refreshes. Switching accounts
 * or games is a different authority scope and must restore that scope instead.
 */
export function shouldRestoreV3FantasyRoster(input: {
  rosterScope: string;
  draftScope: string;
  draftDirty: boolean;
}) {
  return !input.draftDirty || input.rosterScope !== input.draftScope;
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
  if (input.selected.length !== input.game.roster_size || new Set(input.selected).size !== input.selected.length) {
    return false;
  }

  const eligibleCosts = new Map(
    input.choices
      .filter((choice) =>
        choice.game_id === input.game.id &&
        choice.eligible &&
        Number.isFinite(choice.cost) &&
        choice.cost >= 0,
      )
      .map((choice) => [choice.country_id, choice.cost]),
  );
  if (!input.selected.every((countryId) => eligibleCosts.has(countryId))) return false;

  const total = input.selected.reduce((sum, countryId) => sum + eligibleCosts.get(countryId)!, 0);
  return Number.isFinite(input.game.budget) && total <= input.game.budget;
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
