import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/admin-readiness-data.ts", "utf8");

const EXPECTED_PROJECTIONS = [
  "id,edition_id,show_id,country_id,contest_entity_id,artist,song,running_order,semi_final,qualified,notes",
  "id,edition_id,show_id,country_id,contest_entity_id,name,kind,flag_image,accent_color,sort_order,created_at",
  "id,edition_id,show_id,voter_country_id,voter_id,voter_entity_id,receiving_country_id,receiving_entity_id,points",
  "id,edition_id,show_id,voter_id,voter_country_id,voter_entity_id,status,note",
  "id,edition_id,show_id,country_id,contest_entity_id,points",
  "id,edition_id,show_id,country_id,contest_entity_id,jury_points,televote_points,total_points,final_rank",
] as const;

const READINESS_TABLES = [
  "participants",
  "voters",
  "jury_votes",
  "jury_ballot_statuses",
  "televote_votes",
  "results",
] as const;

describe("Organizer Control Room readiness egress contract", () => {
  it("uses explicit least-data projections instead of schema-wide wildcard reads", () => {
    expect(source).toContain("const READINESS_SELECTS = {");
    expect(source).toContain(".select(READINESS_SELECTS[table])");
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");

    for (const projection of EXPECTED_PROJECTIONS) {
      expect(source).toContain(projection);
    }
  });

  it("keeps every readiness family explicit so new tables cannot enter the payload accidentally", () => {
    for (const table of READINESS_TABLES) {
      expect(source).toContain(`${table}:`);
      expect(source).toContain(`\"${table}\", editionId`);
    }

    expect(source).toContain("type ReadinessTable = keyof typeof READINESS_SELECTS");
  });

  it("remains exact-edition and deterministically paged", () => {
    expect(source).toContain("const PAGE_SIZE = 500");
    expect(source).toContain('.eq("edition_id", editionId)');
    expect(source).toContain('.order("id", { ascending: true })');
    expect(source).toContain(".range(from, from + PAGE_SIZE - 1)");
    expect(source).toContain("enabled: !!editionId");
    expect(source).toContain('["admin-readiness-data", editionId ?? "pending"]');
  });

  it("does not turn readiness into a polling or realtime traffic source", () => {
    expect(source).not.toContain("refetchInterval");
    expect(source).not.toContain("setInterval(");
    expect(source).not.toContain(".channel(");
    expect(source).not.toContain("postgres_changes");
  });
});
