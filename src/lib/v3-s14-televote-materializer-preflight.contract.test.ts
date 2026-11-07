import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adapter = readFileSync(
  resolve(process.cwd(), "scripts/v3-s14-materialize-televote-results.ts"),
  "utf8",
);

describe("S14 Televote materializer preflight before local writes", () => {
  const firstWrite = adapter.indexOf('.from("round_results").delete()');
  const influenceWrite = adapter.indexOf('.from("round_influence_results").delete()');
  const insert = adapter.indexOf('.from("round_results").insert(rows)');
  const publish = adapter.indexOf('.update({ results_status: "published" })');

  it("validates frozen round → exact Solaris show/edition binding before any local mutation", () => {
    const bindingRead = adapter.indexOf('.from("televoting_round_bindings")');
    const bindingGuard = adapter.indexOf('if (\n    !binding || String(binding.remote_round_id) !== roundId');
    expect(bindingRead).toBeGreaterThan(-1);
    expect(bindingGuard).toBeGreaterThan(bindingRead);
    expect(adapter).toContain('String(binding.remote_edition_id) !== String(round.edition_id)');
    expect(adapter).toContain('binding.source_mode !== "show"');
    expect(adapter).toContain('String(binding.show_id) !== showId');
    expect(adapter).toContain('String(binding.edition_id) !== editionId');
    expect(adapter).toContain('!binding.frozen_at');
    expect(adapter).toContain('.select("id,edition_id,status,participant_mode,total_points_to_distribute');
    expect(adapter).toContain('.select("remote_round_id,remote_edition_id,edition_id,show_id,source_mode,frozen_at")');
    expect(bindingGuard).toBeLessThan(firstWrite);
    expect(bindingGuard).toBeLessThan(influenceWrite);
    expect(bindingGuard).toBeLessThan(insert);
    expect(bindingGuard).toBeLessThan(publish);
  });

  it("accepts only country-mode rounds and explicit country entries before any write", () => {
    const roundModeGuard = adapter.indexOf('if (round.participant_mode !== "countries")');
    const entryModeGuard = adapter.indexOf('if (row.entry_type !== "country"');
    expect(adapter).toContain('.select("id,edition_id,status,participant_mode,total_points_to_distribute');
    expect(adapter).toContain('.select("entry_type,country_code,display_order")');
    expect(adapter).not.toContain('row.country_code ?? row.entry_key');
    expect(roundModeGuard).toBeGreaterThan(-1);
    expect(entryModeGuard).toBeGreaterThan(roundModeGuard);
    expect(entryModeGuard).toBeLessThan(firstWrite);
    expect(entryModeGuard).toBeLessThan(influenceWrite);
    expect(entryModeGuard).toBeLessThan(insert);
    expect(entryModeGuard).toBeLessThan(publish);
  });

  it("checks authoritative show, edition and roster before clearing, inserting or publishing results", () => {
    const show = adapter.indexOf('.from("shows")');
    const participants = adapter.indexOf('.from("participants")');
    const countries = adapter.indexOf('.from("countries")');
    const rosterMatch = adapter.indexOf('if (JSON.stringify(expectedCodes) !== JSON.stringify(resultCodes))');
    for (const preflight of [show, participants, countries, rosterMatch]) {
      expect(preflight).toBeGreaterThan(-1);
      expect(preflight).toBeLessThan(firstWrite);
      expect(preflight).toBeLessThan(influenceWrite);
      expect(preflight).toBeLessThan(insert);
    }
    expect(adapter).toContain('if (!show || show.edition_id !== editionId)');
    expect(adapter).toContain('const resultCodes = [...participants].sort();');
    expect(rosterMatch).toBeLessThan(publish);
  });

  it("finishes pure conversion before destructive writes, then still checks canonical publication provenance", () => {
    const robust = adapter.indexOf('if (engineVersion === ROBUST_TELEVOTE_ENGINE_VERSION)');
    const convertEnd = adapter.indexOf('const { error: resultInsertError }');
    expect(robust).toBeGreaterThan(-1);
    expect(robust).toBeLessThan(firstWrite);
    expect(firstWrite).toBeLessThan(convertEnd);
    expect(influenceWrite).toBeLessThan(convertEnd);
    expect(insert).toBeLessThan(publish);
    expect(adapter.indexOf('rpc(\n    "studio2_televote_projection_status"')).toBeGreaterThan(publish);
    expect(adapter).toContain('canonical Televote projection provenance mismatch');
    expect(adapter).not.toContain('db.from("televote_votes").insert');
  });
});
