import { describe, expect, it } from "vitest";

import {
  canEditV3FantasyRoster,
  fantasyBudgetUsed,
  fantasyRosterReady,
  resolveV3FantasyState,
  restoreV3FantasyRoster,
  type V3FantasyGame,
} from "./v3-fantasy";

const game: V3FantasyGame = {
  id: "game-1",
  edition_id: "edition-1",
  show_id: "show-1",
  name: "Fantasy Final",
  opens_at: "2026-10-16T10:00:00Z",
  locks_at: "2026-10-17T10:00:00Z",
  status: "open",
  roster_size: 2,
  budget: 20,
  captain_multiplier: 2,
  scoring_version: "v1",
};

describe("V3 Fantasy projection", () => {
  it("maps the authoritative game/team lifecycle without inventing archive state", () => {
    expect(resolveV3FantasyState({ game, team: null, nowMs: Date.parse("2026-10-16T12:00:00Z") })).toBe("open");
    expect(resolveV3FantasyState({ game, team: { id: "team", game_id: game.id, profile_id: "viewer", state: "submitted", captain_country_id: null, score: null }, nowMs: Date.parse("2026-10-16T12:00:00Z") })).toBe("submitted");
    expect(resolveV3FantasyState({ game: { ...game, status: "locked" }, team: null, nowMs: Date.parse("2026-10-16T12:00:00Z") })).toBe("locked");
    expect(resolveV3FantasyState({ game: { ...game, status: "scoring" }, team: null, nowMs: Date.parse("2026-10-18T12:00:00Z") })).toBe("live_scoring");
    expect(resolveV3FantasyState({ game: { ...game, status: "scored" }, team: null, nowMs: Date.parse("2026-10-18T12:00:00Z") })).toBe("settled");
  });

  it("never opens or locks a roster from the viewer device clock", () => {
    const beforeOpen = Date.parse("2026-01-01T00:00:00Z");
    const afterLock = Date.parse("2036-01-01T00:00:00Z");

    expect(resolveV3FantasyState({ game, team: null, nowMs: beforeOpen })).toBe("open");
    expect(resolveV3FantasyState({ game, team: null, nowMs: afterLock })).toBe("open");

    const draft = { ...game, status: "draft" };
    expect(resolveV3FantasyState({ game: draft, team: null, nowMs: afterLock })).toBe("upcoming");
  });

  it("restores the canonical saved roster and captain instead of reopening an empty builder", () => {
    const restored = restoreV3FantasyRoster(
      { id: "team", game_id: game.id, profile_id: "viewer", state: "submitted", captain_country_id: "country-b", score: null },
      [
        { team_id: "team", country_id: "country-a", cost_locked: 8 },
        { team_id: "team", country_id: "country-b", cost_locked: 10 },
      ],
    );
    expect(restored).toEqual({ selected: ["country-a", "country-b"], captain: "country-b" });
  });

  it("derives roster readiness from exact size and server-published costs", () => {
    const choices = [
      { game_id: game.id, country_id: "country-a", cost: 8, eligible: true },
      { game_id: game.id, country_id: "country-b", cost: 10, eligible: true },
      { game_id: game.id, country_id: "country-c", cost: 15, eligible: true },
    ];
    expect(fantasyBudgetUsed(["country-a", "country-b"], choices)).toBe(18);
    expect(fantasyRosterReady({ game, selected: ["country-a", "country-b"], choices })).toBe(true);
    expect(fantasyRosterReady({ game, selected: ["country-b", "country-c"], choices })).toBe(false);
    expect(fantasyRosterReady({ game, selected: ["country-a"], choices })).toBe(false);
  });

  it("only exposes editing while the authoritative lifecycle still permits roster changes", () => {
    expect(canEditV3FantasyRoster("open")).toBe(true);
    expect(canEditV3FantasyRoster("submitted")).toBe(true);
    expect(canEditV3FantasyRoster("locked")).toBe(false);
    expect(canEditV3FantasyRoster("live_scoring")).toBe(false);
    expect(canEditV3FantasyRoster("settled")).toBe(false);
  });
});
