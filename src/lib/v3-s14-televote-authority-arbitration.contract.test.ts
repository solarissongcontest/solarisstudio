import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrations = migrationFiles
  .map((name) => `\n-- FILE: ${name}\n${readFileSync(resolve(migrationDir, name), "utf8")}`)
  .join("\n");

const canonicalFoundation = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017002000_v3_s14_televote_deadline_extension.sql"),
  "utf8",
);
const canonicalReplayFix = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017002100_v3_s14_televote_deadline_replay_fix.sql"),
  "utf8",
);

describe("S14 Televote deadline authority arbitration", () => {
  it("keeps exactly one persisted deadline field family", () => {
    expect(migrations).toContain("add column if not exists closes_at timestamptz");
    expect(migrations).not.toContain("voting_deadline_at");
    expect(migrations).not.toContain("voting_deadline_revision");
  });

  it("keeps one governed deadline command family instead of parallel set/extend authorities", () => {
    expect(canonicalFoundation).toContain("televoting.studio2_round_deadline_change_preview");
    expect(canonicalReplayFix).toContain("televoting.studio2_apply_round_deadline_change");
    expect(canonicalReplayFix).toContain("'televote.deadline.change'");

    for (const competingRpc of [
      "studio2_round_deadline_set_preview",
      "studio2_apply_round_deadline_set",
      "studio2_round_deadline_extension_preview",
      "studio2_apply_round_deadline_extension",
    ]) {
      expect(migrations).not.toContain(competingRpc);
    }
    expect(migrations).not.toContain("'televote.round.extend_deadline'");
  });

  it("preserves lifecycle close time as separate from ballot acceptance deadline", () => {
    expect(migrations).toContain("closed_at");
    expect(canonicalFoundation).toContain("closes_at");
    expect(canonicalFoundation).toContain("Voting deadline has passed");
    expect(canonicalFoundation).not.toContain("opened_at > closed_at");
    expect(canonicalFoundation).not.toContain("extension-reopen");
  });

  it("binds one canonical deadline operation to S2 receipts and one extension event", () => {
    expect(canonicalReplayFix).toContain("private.studio2_claim_operation(");
    expect(canonicalReplayFix).toContain("'televote.deadline.change'");
    expect(canonicalReplayFix).toContain("'televote.extended'");
    expect(canonicalReplayFix).toContain("array['televote.tasks']::text[]");
  });
});
