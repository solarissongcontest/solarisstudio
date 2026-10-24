import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/community-moderation.tsx",
  "utf8",
);
const operationMigration = readFileSync(
  "supabase/migrations/20261002203000_organisation_os_v5_operation_contract.sql",
  "utf8",
);

describe("V3 Organizer Community moderation fresh-review compatibility", () => {
  it("freezes the reviewed profile fingerprint and one operation identity", () => {
    expect(route).toContain("function moderationReviewFingerprint(profile: FanProfileModerationRow)");
    expect(route).toContain("profileFingerprint: moderationReviewFingerprint(profile)");
    expect(route).toContain("operationId: command.operationId");
    expect(route).toContain("idempotencyKey: command.idempotencyKey");
    expect(route).toContain("commandReason: null");
    expect(route).toContain("commandAttempted: false");
  });

  it("re-reads the protected profile and fails stale first attempts closed", () => {
    const preflightGuard = route.indexOf("if (!reviewed.commandAttempted) {");
    const reRead = route.indexOf("const live = await loadExactModerationProfile(reviewed.profile);");
    const staleCheck = route.indexOf(
      "moderationReviewFingerprint(live) !== reviewed.profileFingerprint",
    );
    const command = route.indexOf("moderate.mutate({");

    expect(route).toContain('rpc("admin_fan_profile_moderation"');
    expect(route).toContain("p_limit: 250");
    expect(route).toContain("profile.profileId === reviewed.profileId");
    expect(preflightGuard).toBeGreaterThan(-1);
    expect(reRead).toBeGreaterThan(preflightGuard);
    expect(staleCheck).toBeGreaterThan(reRead);
    expect(command).toBeGreaterThan(staleCheck);
    expect(route).toContain(
      "changed while this moderation decision was being reviewed. Nothing was changed.",
    );
    expect(route).toContain('queryKey: ["admin-fan-profile-moderation"]');
  });

  it("freezes moderation reason before the command boundary", () => {
    const freezeReason = route.indexOf("reviewed = { ...reviewed, commandReason: reason };");
    const command = route.indexOf("moderate.mutate({");

    expect(freezeReason).toBeGreaterThan(-1);
    expect(command).toBeGreaterThan(freezeReason);
    expect(route).toContain("reason: reviewed.commandReason ?? reason");
    expect(route).toContain("pendingModeration.commandReason !== null");
    expect(route).toContain(
      "Reason frozen for this operation identity. Close and reopen review to change it.",
    );
  });

  it("preserves same-identity retry semantics after the first command attempt", () => {
    expect(route).toContain("reviewed = { ...reviewed, commandAttempted: true };");
    expect(route).toContain("recovery?.allowSameIdentityRetry");
    expect(route).toContain("Retry same operation");
    expect(route).toContain(
      "Retrying here reuses the same frozen reason and operation identity; it does not run a new stale-state preflight against a command that may already have committed.",
    );
    expect(operationMigration).toContain("private.studio2_claim_operation(");
    expect(operationMigration).toContain("p_operation_id");
    expect(operationMigration).toContain("p_idempotency_key");
  });

  it("states the remaining authoritative CAS dependency instead of claiming parity", () => {
    expect(route).toContain("System #1579");
    expect(route).toContain(
      "is still required to move that expected-version check into the authoritative transaction.",
    );
    expect(operationMigration).not.toContain("p_expected_profile_version");
  });
});
