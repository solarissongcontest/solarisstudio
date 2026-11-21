import { describe, expect, it } from "vitest";

import type { Participant, ResultRow } from "./data";
import {
  filterResultsToCompetingParticipants,
  participationStatus,
  participationStatusLabel,
  participationStatusCommandSubject,
  type ParticipationAwareParticipant,
} from "./participation-status";

function participant(countryId: string, status: string): ParticipationAwareParticipant {
  return {
    id: `p-${countryId}`,
    edition_id: "edition-1",
    show_id: "show-1",
    country_id: countryId,
    contest_entity_id: null,
    artist: null,
    song: null,
    running_order: null,
    semi_final: "grand-final",
    qualified: null,
    notes: null,
    participation_status: status,
  } as Participant & { participation_status: string };
}

function result(countryId: string, rank: number): ResultRow {
  return {
    id: `r-${countryId}`,
    edition_id: "edition-1",
    show_id: "show-1",
    country_id: countryId,
    jury_points: 100,
    televote_points: 100,
    total_points: 200,
    final_rank: rank,
  };
}

describe("participation status", () => {
  it("keeps withdrawn and disqualified countries in participants but removes their results", () => {
    const participants = [
      participant("active", "confirmed"),
      participant("withdrawn", "withdrawn"),
      participant("dq", "disqualified"),
    ];
    const results = [result("active", 1), result("withdrawn", 2), result("dq", 3)];

    expect(participants).toHaveLength(3);
    expect(filterResultsToCompetingParticipants(results, participants).map((row) => row.country_id)).toEqual(["active"]);
  });

  it("passes a single country identity for global countries with both database IDs", () => {
    const global = participant("country-1", "withdrawn");
    global.contest_entity_id = "entity-1";
    expect(participationStatusCommandSubject(global, true)).toEqual({
      countryId: "country-1",
      contestEntityId: null,
    });
  });

  it("uses entity identity only for custom edition-only countries", () => {
    const custom = participant("custom-country", "confirmed");
    custom.contest_entity_id = "custom-entity";
    expect(participationStatusCommandSubject(custom, false)).toEqual({
      countryId: null,
      contestEntityId: "custom-entity",
    });
    custom.contest_entity_id = null;
    expect(participationStatusCommandSubject(custom, false)).toEqual({
      countryId: null,
      contestEntityId: "custom-country",
    });
  });

  it("treats missing/legacy status as active and labels statuses for the UI", () => {
    expect(participationStatus(participant("legacy", "pending"))).toBe("confirmed");
    expect(participationStatusLabel("confirmed")).toBe("Active");
    expect(participationStatusLabel("withdrawn")).toBe("Withdrawn");
    expect(participationStatusLabel("disqualified")).toBe("Disqualified");
  });
});
