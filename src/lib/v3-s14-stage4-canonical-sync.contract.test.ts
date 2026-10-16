import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const stage4 = source(".github/scripts/v3-s14-stage-4-entries.sh");
const runtime = source(".github/scripts/v3-s14-lib.sh");
const syncRunner = source("scripts/v3-s14-sync-confirmation-entry.ts");

describe("S14 Stage 4 canonical projection hardening", () => {
  it("routes Confirmation state into Solaris through the real integration instead of QA-only canonical writes", () => {
    expect(stage4).toContain("v3-s14-sync-confirmation-entry.ts");
    expect(syncRunner).toContain("syncConfirmationSubmissionToSolarisInternal");
    expect(stage4).not.toMatch(/insert\s+into\s+public\.entries/i);
    expect(stage4).not.toMatch(/update\s+public\.entries\s+set/i);
    expect(stage4).not.toMatch(/update\s+public\.participants\s+set\s+participation_status/i);
  });

  it("keeps the sync runner permanently loopback-only before exposing service-role authority to it", () => {
    expect(runtime).toContain('export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"');
    expect(runtime.indexOf('refusing S14 against non-local API_URL')).toBeLessThan(
      runtime.indexOf('export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"'),
    );
    expect(syncRunner).toContain("127\\.0\\.0\\.1|localhost");
    expect(syncRunner).toContain("S14 canonical sync refuses non-local Supabase URL");
    expect(syncRunner).toContain("S14 canonical sync requires the local Supabase service-role key");
  });

  it("projects media replacement from a new participant Entry revision and rebinds exact review evidence", () => {
    expect(stage4).toContain("participant Media source replacement");
    expect(stage4).toContain("ENTRY_ONE_NEW_VERSION");
    expect(stage4).toContain("replacement Entry exact-version approval");
    expect(stage4).toContain("stale Media approval survived canonical source replacement");
    expect(stage4).toContain("old Media review was not explicitly superseded");
    expect(stage4).toContain("private.v3_media_asset_is_currently_accepted");
  });

  it("reconciles withdrawal through governed participation authority rather than mutating participants directly", () => {
    expect(stage4).toContain("studio2_participation_status_change_preview");
    expect(stage4).toContain("studio2_apply_participation_status");
    expect(stage4).toContain("governed withdrawal reconciliation");
    expect(stage4).toContain("withdrawal left confirmed show-specific participant state");
  });

  it("preserves the Stage 4 invariant markers and shell syntax", () => {
    expect(stage4).toContain("S14_INVARIANT_ENTRY_COMPLETE");
    expect(stage4).toContain("S14_INVARIANT_MEDIA_COMPLETE");
    expect(stage4).toContain("S14_FAILURE_TWO_ORGANIZERS_COMPLETE");
    expect(stage4).toContain("S14_STAGE_4_ENTRIES_COMPLETE");
    expect(() => execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-4-entries.sh"], { stdio: "pipe" })).not.toThrow();
  });
});
