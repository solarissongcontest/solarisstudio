import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/voting-system/$slug.tsx"),
  "utf8",
);
const authority = readFileSync(
  resolve(process.cwd(), "src/lib/v3-organizer-voting-config-authority.ts"),
  "utf8",
);
const systemAuthority = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261019231500_v3_versioned_voting_config.sql"),
  "utf8",
);
const riskClosure = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261019231600_v3_voting_config_preflight_risk_closure.sql"),
  "utf8",
);

describe("V3 Organizer voting configuration cutover", () => {
  it("consumes the canonical System snapshot, preflight and versioned apply contract", () => {
    expect(authority).toContain('"studio2_voting_config_snapshot"');
    expect(authority).toContain('"studio2_voting_config_preflight"');
    expect(authority).toContain('"studio2_apply_voting_config_change"');
    expect(authority).toContain("p_expected_version: input.expectedVersion");
    expect(route).toContain("fetchOrganizerVotingConfigSnapshot");
    expect(route).toContain("preflightOrganizerVotingConfigChange");
    expect(route).toContain("applyOrganizerVotingConfigChange");

    expect(systemAuthority).toContain("create or replace function public.studio2_voting_config_snapshot(");
    expect(systemAuthority).toContain("create or replace function public.studio2_apply_voting_config_change(");
    expect(riskClosure).toContain("create or replace function public.studio2_voting_config_preflight(");
  });

  it("removes the legacy browser-owned voting and Results mutation path", () => {
    expect(route).not.toContain('supabase.from("shows")');
    expect(route).not.toContain('supabase.from("results")');
    expect(route).not.toContain("rerankExistingResults");
    expect(route).not.toContain("useJuryVotes");
    expect(route).not.toContain("useTelevotes");
    expect(route).not.toContain("results.final_rank");
    expect(route).toContain("It will not recalculate or publish results as a hidden side effect.");
  });

  it("fails closed on edition and explicit show context drift", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain("organizerEditionId !== edition.id");
    expect(route).toContain("staleShowSelection");
    expect(route).toContain("Solaris will not silently substitute another show.");
    expect(authority).toContain("snapshot.editionId !== input.editionId || snapshot.showId !== input.showId");
    expect(authority).toContain("preflight.editionId !== input.editionId || preflight.showId !== input.showId");
    expect(authority).toContain("result.operationId !== input.operationId");
    expect(authority).toContain("result.editionId !== input.editionId");
    expect(authority).toContain("result.showId !== input.showId");
  });

  it("binds review to the version actually shown and revalidates before commit", () => {
    expect(route).toContain("preflight.expectedVersion !== snapshot.version");
    expect(route).toContain("expectedVersion: preflight.expectedVersion");
    expect(route).toContain('command: "voting.config.update"');
    expect(route).toContain('riskClass: "R2"');
    expect(route).toContain("expectedVersion: review.expectedVersion");
    expect(route).toContain("configuration version and voting/result evidence at commit time");
  });

  it("treats official voting/result evidence as a hard freeze rather than a recalculation prompt", () => {
    expect(route).toContain('preflight.riskClass === "blocked"');
    expect(route).toContain("Voting configuration is frozen because official voting or result evidence now exists");
    expect(systemAuthority).toContain("private.v3_voting_config_change_blocked");
    expect(systemAuthority).toContain("message = 'DEPENDENCY_FAILURE'");
    expect(riskClosure).toContain("when v_blocked then 'blocked'");
    expect(riskClosure).toContain("else 'R2'");
  });

  it("uses operation identity and bounded reconciliation for uncertain outcomes", () => {
    expect(route).toContain("createOrganisationCommand({");
    expect(route).toContain("operationId: command.operationId");
    expect(route).toContain("idempotencyKey: command.idempotencyKey");
    expect(route).toContain("reconcileSystemOperation");
    expect(route).toContain("parseOrganizerVotingConfigApplyResult(reconciliation.receipt.result)");
    expect(route).toContain("Confirmed from the canonical operation ledger after an uncertain response.");
  });

  it("preserves compatibility metadata instead of replacing the canonical config with a client-only subset", () => {
    expect(route).toContain("mergeVotingConfigWithCompatibilityMetadata(snapshot.config, draft)");
    expect(authority).toContain("...authoritativeConfig");
    expect(authority).toContain("...draft");
    expect(authority).toContain("...existingWeighting");
    expect(authority).toContain("...draft.weighting");
  });

  it("does not re-fetch Results as a fake consequence of a config-only command", () => {
    expect(route).toContain('qc.invalidateQueries({ queryKey: ["shows"] })');
    expect(route).toContain('qc.invalidateQueries({ queryKey: ["show"] })');
    expect(route).not.toContain('qc.invalidateQueries({ queryKey: ["results"] })');
  });
});
