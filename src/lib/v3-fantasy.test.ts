import { describe, expect, it } from "vitest";

import {
  canEditV3FantasyRoster,
  canShowV3FantasyTeamScore,
  fantasyBudgetUsed,
  fantasyRosterReady,
  normalizeV3FantasyStandings,
  resolveV3FantasyState,
  restoreV3FantasyRoster,
  shouldRestoreV3FantasyRoster,
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

  it("does not leak an individual score during partial game scoring", () => {
    const team = {
      id: "team", game_id: game.id, profile_id: "viewer",
      state: "scored", captain_country_id: null, score: 42,
    };
    const beforeScoring = { ...game, status: "locked" };
    const scoring = { ...game, status: "scoring" };
    const settled = { ...game, status: "scored" };
    const nowMs = Date.parse("2026-10-18T12:00:00Z");
    expect(resolveV3FantasyState({ game: scoring, team, nowMs })).toBe("live_scoring");
    expect(resolveV3FantasyState({ game: beforeScoring, team, nowMs })).toBe("locked");
    expect(canShowV3FantasyTeamScore(scoring, team)).toBe(false);
    expect(canShowV3FantasyTeamScore(beforeScoring, team)).toBe(false);
    expect(canShowV3FantasyTeamScore(settled, team)).toBe(true);
    expect(canShowV3FantasyTeamScore(settled, { ...team, game_id: "other" })).toBe(false);
    expect(canShowV3FantasyTeamScore(settled, { ...team, state: "submitted" })).toBe(false);
    expect(canShowV3FantasyTeamScore(settled, { ...team, score: Number.NaN })).toBe(false);
    expect(canShowV3FantasyTeamScore(settled, { ...team, score: Number.POSITIVE_INFINITY })).toBe(false);
    expect(canShowV3FantasyTeamScore(settled, { ...team, score: null })).toBe(false);
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

  it("preserves unsaved drafts on refetch but restores on account or game switch", () => {
    expect(shouldRestoreV3FantasyRoster({ rosterScope: "A:game-1", draftScope: "A:game-1", draftDirty: true })).toBe(false);
    expect(shouldRestoreV3FantasyRoster({ rosterScope: "A:game-1", draftScope: "A:game-1", draftDirty: false })).toBe(true);
    expect(shouldRestoreV3FantasyRoster({ rosterScope: "B:game-1", draftScope: "A:game-1", draftDirty: true })).toBe(true);
    expect(shouldRestoreV3FantasyRoster({ rosterScope: "A:game-2", draftScope: "A:game-1", draftDirty: true })).toBe(true);
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
    expect(fantasyRosterReady({ game, selected: ["country-a", "country-a"], choices })).toBe(false);
    expect(fantasyRosterReady({ game, selected: ["country-a", "not-a-country"], choices })).toBe(false);
    expect(fantasyRosterReady({ game, selected: ["country-a", "country-b"], choices: choices.map((choice) => choice.country_id === "country-b" ? { ...choice, eligible: false } : choice) })).toBe(false);
    expect(fantasyRosterReady({ game, selected: ["country-a", "country-b"], choices: choices.map((choice) => choice.country_id === "country-b" ? { ...choice, game_id: "another-game" } : choice) })).toBe(false);
    expect(fantasyRosterReady({ game, selected: ["country-a", "country-b"], choices: choices.map((choice) => choice.country_id === "country-b" ? { ...choice, cost: Number.NaN } : choice) })).toBe(false);
  });

  it("only exposes editing while the authoritative lifecycle still permits roster changes", () => {
    expect(canEditV3FantasyRoster("open")).toBe(true);
    expect(canEditV3FantasyRoster("submitted")).toBe(true);
    expect(canEditV3FantasyRoster("locked")).toBe(false);
    expect(canEditV3FantasyRoster("live_scoring")).toBe(false);
    expect(canEditV3FantasyRoster("settled")).toBe(false);
  });
  it("accepts valid versioned standings including tied ranks, numeric strings and zero points", () => {
    const rows = [
      { profileId: "fan-a", displayName: "Fan A", score: "26.50", position: "1" },
      { profileId: "fan-b", displayName: "Fan B", score: 26.5, position: 1 },
      { profileId: "fan-c", displayName: "Fan C", score: 0, position: 3 },
    ];
    expect(normalizeV3FantasyStandings(rows)).toEqual([
      { profileId: "fan-a", displayName: "Fan A", score: 26.5, position: 1 },
      { profileId: "fan-b", displayName: "Fan B", score: 26.5, position: 1 },
      { profileId: "fan-c", displayName: "Fan C", score: 0, position: 3 },
    ]);
    expect(normalizeV3FantasyStandings([])).toEqual([]);
  });

  it("fails the entire standings projection closed when a ranking or identity is malformed", () => {
    const good = { profileId: "fan-a", displayName: "Fan A", score: 24, position: 1 };
    const malformed: unknown[] = [
      null, undefined, {}, "unexpected", [good],
      { ...good, score: "NaN" },
      { ...good, score: "Infinity" },
      { ...good, score: "0x10" },
      { ...good, score: "" },
      { ...good, score: -1 },
      { ...good, score: Number.POSITIVE_INFINITY },
      { ...good, position: 0 },
      { ...good, position: "1.5" },
      { ...good, position: Number.NaN },
      { ...good, profileId: "" },
      { ...good, displayName: "   " },
    ];
    for (const row of malformed) {
      expect(() => normalizeV3FantasyStandings([good, row])).toThrow();
    }
    expect(() => normalizeV3FantasyStandings({ rows: [] })).toThrow();
    expect(() => normalizeV3FantasyStandings([good, { ...good }])).toThrow();
  });

});
