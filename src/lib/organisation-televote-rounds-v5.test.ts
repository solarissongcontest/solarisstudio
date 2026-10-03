import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 televote round lifecycle", () => {
  const migration = source(
    "supabase/migrations/20261003017000_organisation_os_v5_televote_round_operations.sql",
  );
  const functions = source("src/integrations/televoting/rounds.functions.ts");
  const server = source("src/integrations/televoting/rounds.server.ts");
  const view = source("src/components/televoting/VotingRoundsView.tsx");

  it("versions both the global single-open invariant and target-round truth", () => {
    expect(migration).toContain(
      "create table if not exists public.studio2_televote_global_versions",
    );
    expect(migration).toContain(
      "create table if not exists public.studio2_televote_round_versions",
    );
    expect(migration).toContain(
      "studio2_televote_rounds_touch_global_version",
    );
    expect(migration).toContain(
      "studio2_televote_entries_touch_round_version",
    );
    expect(migration).toContain(
      "public.studio2_televote_global_versions.version + 1",
    );
    expect(migration).toContain(
      "public.studio2_televote_round_versions.version + 1",
    );
  });

  it("requires an R2 operation receipt and both expected revisions", () => {
    expect(migration).toContain(
      "televoting.studio2_round_status_change_preview",
    );
    expect(migration).toContain(
      "televoting.studio2_apply_round_status_change",
    );
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("p_idempotency_key");
    expect(migration).toContain("p_expected_global_version");
    expect(migration).toContain("p_expected_round_version");
    expect(migration).toContain(
      "hashtextextended('studio2-televote-round-state', 0)",
    );
    expect(migration).toContain(
      "Televote round state changed since this preview was loaded. Refresh before continuing.",
    );
    expect(migration).toContain("using errcode = '40001'");
  });

  it("blocks direct authenticated status updates outside the operation wrapper", () => {
    expect(migration).toContain(
      "private.studio2_guard_direct_televote_status",
    );
    expect(migration).toContain(
      "Televote round status must use the Organisation OS operation contract.",
    );
    expect(migration).toContain("current_user in ('authenticated', 'anon')");
  });

  it("protects result lifecycle when voting reopens", () => {
    expect(migration).toContain(
      "Locked or published televote results must be unlocked before voting workflow can reopen.",
    );
    expect(migration).toContain(
      "when p_status = 'open' and calculation_version > 0 then true",
    );
    expect(migration).toContain("'resultsStatus'");
    expect(migration).toContain("'resultsOutdated'");
  });

  it("previews ballot and integrity impact before changing live state", () => {
    expect(migration).toContain("'entryCount'");
    expect(migration).toContain("'ballotCount'");
    expect(migration).toContain("'suspiciousBallotCount'");
    expect(migration).toContain("'otherOpenRound'");
    expect(migration).toContain("'blockers'");
    expect(view).toContain("TelevoteRoundImpactPreview");
    expect(view).toContain("Stored ballots");
    expect(view).toContain("Suspicious ballots");
  });

  it("removes the direct TypeScript status mutation path", () => {
    expect(functions).toContain("previewMergedTelevotingRoundStatus");
    expect(functions).toContain("expectedGlobalVersion");
    expect(functions).toContain("expectedRoundVersion");
    expect(server).toContain('"studio2_round_status_change_preview"');
    expect(server).toContain('"studio2_apply_round_status_change"');
    expect(server).not.toContain('.from("rounds").update(patch).eq("id", data.id)');
  });

  it("keeps one operation identity across confirmation retries", () => {
    expect(view).toContain("operationId: crypto.randomUUID()");
    expect(view).toContain("idempotencyKey: crypto.randomUUID()");
    expect(view).toContain("operationId: pending.operationId");
    expect(view).toContain("idempotencyKey: pending.idempotencyKey");
    expect(view).toContain(
      "expectedGlobalVersion: pending.preview.expectedGlobalVersion",
    );
    expect(view).toContain(
      "expectedRoundVersion: pending.preview.expectedRoundVersion",
    );
    expect(view).toContain("AdminConfirmSheet");
  });
});
