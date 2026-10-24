import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/data-live.ts", "utf8");

const EXPECTED_PROJECTIONS = [
  "id,edition_id,show_id,voter_country_id,voter_id,voter_entity_id,receiving_country_id,receiving_entity_id,points",
  "id,edition_id,show_id,country_id,contest_entity_id,points",
  "id,edition_id,show_id,country_id,contest_entity_id,jury_points,televote_points,total_points,final_rank",
  "id,edition_id,show_id,country_id,contest_entity_id,artist,song,running_order,semi_final,qualified,notes",
] as const;

const ARCHIVE_TABLES = [
  "jury_votes",
  "televote_votes",
  "results",
  "participants",
] as const;

describe("Public complete archive egress contract", () => {
  it("uses explicit typed projections rather than schema-wide wildcard reads", () => {
    expect(source).toContain("const ARCHIVE_SELECTS = {");
    expect(source).toContain(".select(ARCHIVE_SELECTS[table])");
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");

    for (const projection of EXPECTED_PROJECTIONS) {
      expect(source).toContain(projection);
    }
  });

  it("keeps the full-history API bounded and deterministic", () => {
    expect(source).toContain("const PAGE_SIZE = 1000");
    expect(source).toContain('.order("id", { ascending: true })');
    expect(source).toContain(".range(from, from + PAGE_SIZE - 1)");
    expect(source).toContain("if (page.length < PAGE_SIZE) break");
    expect(source).toContain("type ArchiveTable = keyof typeof ARCHIVE_SELECTS");

    for (const table of ARCHIVE_TABLES) {
      expect(source).toContain(`${table}:`);
    }
  });

  it("preserves the deliberate cold-cache and no-Realtime archive policy", () => {
    expect(source).toContain("const ARCHIVE_STALE_TIME = 60 * 60 * 1000");
    expect(source).toContain('...solarisQueryPolicy("cold")');
    expect(source).toContain("staleTime: ARCHIVE_STALE_TIME");
    expect(source).not.toContain("refetchInterval");
    expect(source).not.toContain(".channel(");
    expect(source).not.toContain("postgres_changes");
  });

  it("keeps deferred archive loading available for mobile first paint", () => {
    expect(source).toContain("enabled: options?.enabled ?? true");
  });
});
