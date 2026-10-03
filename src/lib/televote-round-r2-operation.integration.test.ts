import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 Televoting round R2 contract", () => {
  const migration = source(
    "supabase/migrations/20261003007000_organisation_os_v5_televote_round_r2.sql",
  );
  const functions = source("src/integrations/televoting/rounds.functions.ts");
  const server = source("src/integrations/televoting/rounds.server.ts");
  const view = source("src/components/televoting/VotingRoundsView.tsx");

  it("versions both the whole voting system and the individual round", () => {
    expect(migration).toContain("add column if not exists operation_version bigint");
    expect(migration).toContain("televoting.round_operation_state");
    expect(migration).toContain("studio2_round_operation_version_before_update");
    expect(migration).toContain("studio2_round_entry_operation_version");
    expect(migration).toContain("operation_version = operation_version + 1");
    expect(migration).toContain("studio2_bump_round_global_version");
  });

  it("previews live-voting impact from canonical persisted truth", () => {
    expect(migration).toContain("televoting.studio2_round_status_change_preview");
    expect(migration).toContain("'riskClass', 'R2'");
    expect(migration).toContain("'expectedGlobalVersion'");
    expect(migration).toContain("'expectedRoundVersion'");
    expect(migration).toContain("'entryCount'");
    expect(migration).toContain("'ballotCount'");
    expect(migration).toContain("'suspiciousBallotCount'");
    expect(migration).toContain("'resultsStatus'");
    expect(migration).toContain("'otherOpenRound'");
    expect(server).toContain('"studio2_round_status_change_preview"');
    expect(view).toContain("<TelevoteRoundImpactPreview pending={pendingStatus} />");
  });

  it("blocks unsafe opening and draft transitions", () => {
    expect(migration).toContain(
      "Voting requires between 2 and 50 configured entries.",
    );
    expect(migration).toContain(
      "Another public voting round is already open.",
    );
    expect(migration).toContain(
      "Unlock or unpublish the current Televoting result before reopening voting.",
    );
    expect(migration).toContain(
      "Unlock or unpublish the current Televoting result before returning this round to draft.",
    );
    expect(migration).toContain(
      "results_outdated = results_outdated or calculation_version > 0",
    );
  });

  it("rejects stale previews and safely replays successful retries", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'televoting.round.status.change'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain(
      "Voting round state changed since this impact preview was loaded. Refresh before continuing.",
    );
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(functions).toContain("expectedGlobalVersion: number");
    expect(functions).toContain("expectedRoundVersion: number");
    expect(server).toContain("p_idempotency_key: data.idempotencyKey");
  });

  it("makes direct round status mutation fail closed outside the governed command", () => {
    expect(migration).toContain("televoting.studio2_guard_round_status_write");
    expect(migration).toContain(
      "current_setting('solaris.round_status_command', true)",
    );
    expect(migration).toContain(
      "Round status changes must use the governed R2 command.",
    );
    expect(migration).toContain(
      "Only unused draft rounds can be deleted.",
    );
    expect(migration).toContain(
      "This draft has voting or result history and cannot be deleted. Keep it in history instead.",
    );
    expect(migration).toContain("submission.status <> 'deleted'");
    expect(migration).toContain("from televoting.round_results result_row");
    expect(migration).toContain(
      "set_config('solaris.round_status_command', '1', true)",
    );
  });

  it("freezes the canonical line-up when voting opens and unfreezes only on draft", () => {
    expect(migration).toContain("update public.televoting_round_bindings");
    expect(migration).toContain("set frozen_at = now()");
    expect(migration).toContain("set frozen_at = null");
  });

  it("keeps the UI confirmation bound to one preview identity", () => {
    expect(view).toContain("operationId: crypto.randomUUID()");
    expect(view).toContain("idempotencyKey: crypto.randomUUID()");
    expect(view).toContain("expectedGlobalVersion: pending.preview.expectedGlobalVersion");
    expect(view).toContain("expectedRoundVersion: pending.preview.expectedRoundVersion");
    expect(view).toContain("confirm this R2 voting-state change");
  });
});
