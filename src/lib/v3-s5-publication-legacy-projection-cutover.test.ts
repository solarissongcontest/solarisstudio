import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const cutover = source(
  "supabase/migrations/20261016060500_v3_s5_publication_legacy_projection_cutover.sql",
);
const rehearsal = source(".github/scripts/v3-s5-publication-consequences-rehearsal.sh");

describe("System V3 S5 publication legacy projection cutover", () => {
  it("requires canonical replacement projections before retiring legacy triggers", () => {
    expect(cutover).toContain("shows_sync_edition_publication");
    expect(cutover).toContain("sync_edition_publication_from_shows()");
    expect(cutover).toContain("jury_votes_sync_results");
    expect(cutover).toContain("televote_votes_sync_results");
    expect(cutover).toContain("Canonical show -> edition publication projection trigger is missing");
  });

  it("removes the complete duplicate legacy trigger chain instead of weakening capability checks", () => {
    for (const trigger of [
      "trg_sync_edition_publication_after_show_change",
      "trg_refresh_results_when_show_published",
      "trg_refresh_results_after_participant_change",
      "trg_refresh_results_after_jury_change",
      "trg_refresh_results_after_televote_change",
    ]) {
      expect(cutover).toContain(`drop trigger if exists ${trigger}`);
    }
    for (const helper of [
      "sync_edition_publication_after_show_change()",
      "sync_one_edition_publication(uuid)",
      "refresh_public_results_after_show_change()",
      "refresh_public_results_after_child_change()",
      "refresh_show_results(uuid)",
    ]) {
      expect(cutover).toContain(`drop function if exists public.${helper}`);
    }
    expect(cutover).not.toContain("grant execute");
    expect(cutover).not.toContain("studio2_access_allowed");
  });

  it("proves publishing.publish is sufficient for the governed release command", () => {
    expect(rehearsal).toContain("'publishing.publish'");
    expect(rehearsal).not.toContain("'publishing.manage'");
    expect(rehearsal).toContain("canonical immediate publication");
  });

  it("fails migration if a retired helper or trigger silently returns", () => {
    expect(cutover).toContain("Legacy publication/result projection trigger survived S5 cutover");
    expect(cutover).toContain("Legacy publication/result projection helper survived S5 cutover");
    expect(cutover).toContain("to_regprocedure('public.refresh_show_results(uuid)') is not null");
  });
});
