import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/country-accounts.tsx"),
  "utf8",
);
const adapter = readFileSync(
  resolve(process.cwd(), "src/lib/v3-organizer-country-account-status.ts"),
  "utf8",
);
const systemClient = readFileSync(
  resolve(process.cwd(), "src/lib/v3-country-account-status.ts"),
  "utf8",
);

describe("V3 Organizer country account moderation review", () => {
  it("routes suspension and restoration through an explicit review boundary", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain('onClick={() => requestStatusReview("suspended")}');
    expect(route).toContain('onClick={() => requestStatusReview("active")}');
    expect(route).not.toContain('onClick={() => void suspend()}');
    expect(route).not.toContain('onClick={() => void restore()}');
  });

  it("freezes exact account identity, revision and before-to-after access state", () => {
    expect(route).toContain("userId: target.user_id");
    expect(route).toContain("countryId: target.country_id");
    expect(route).toContain("countryName: target.country_name");
    expect(route).toContain("email: target.email");
    expect(route).toContain("currentStatus: target.status");
    expect(route).toContain("currentSuspensionReason: target.suspension_reason");
    expect(route).toContain("currentUpdatedAt: target.updated_at");
    expect(route).toContain("targetStatus");
    expect(route).toContain("pendingReview.currentStatus");
    expect(route).toContain("pendingReview.targetStatus");
    expect(route).toContain("Reviewed revision:");
  });

  it("forces a fresh directory read and fails closed if account state changed while review was open", () => {
    expect(route).toContain("const refreshed = await refetchAccounts()");
    expect(route).toContain("const refreshedData = refreshed.data");
    expect(route).toContain("refreshed.error || !refreshedData?.schemaReady");
    expect(route).toContain(
      "refreshedData.accounts.find((account) => account.user_id === review.userId)",
    );
    expect(route).toContain("liveAccount.country_id !== review.countryId");
    expect(route).toContain("liveAccount.country_name !== review.countryName");
    expect(route).toContain("liveAccount.email !== review.email");
    expect(route).toContain("liveAccount.status !== review.currentStatus");
    expect(route).toContain("liveAccount.suspension_reason !== review.currentSuspensionReason");
    expect(route).toContain("liveAccount.updated_at !== review.currentUpdatedAt");
    expect(route).toContain("Nothing was changed");
    expect(route).not.toContain(
      "data?.accounts.find((account) => account.user_id === review.userId)",
    );
  });

  it("requires typing the exact country before either access change", () => {
    expect(route).toContain("confirmationText={pendingReview?.countryName}");
    expect(route).toContain("Type ${pendingReview.countryName} to confirm the access change");
  });

  it("cuts the Organizer consumer over to the canonical version-bound R2 command", () => {
    expect(route).toContain("useAdminSetCountryAccountStatusV3");
    expect(route).toContain("countryId: review.countryId");
    expect(route).toContain("currentUpdatedAt: review.currentUpdatedAt");
    expect(route).toContain("targetStatus: review.targetStatus");
    expect(adapter).toContain("applyCountryAccountStatusV3");
    expect(systemClient).toContain('supabase.rpc("studio2_set_country_account_status_v3"');
    expect(systemClient).toContain('riskClass: "R2"');
    expect(systemClient).toContain("p_expected_updated_at: input.currentUpdatedAt");
    expect(systemClient).toContain('supabase.rpc("studio2_reconcile_operation"');
    expect(route).not.toContain('supabase.rpc("admin_set_country_account_status"');
    expect(route).not.toContain("not a version-bound/idempotent V3 command");
    expect(route).not.toContain("a narrow race remains");
  });

  it("keeps one operation identity for the exact reviewed semantics across unresolved retries", () => {
    expect(systemClient).toContain("operationIdentity?: CountryAccountStatusOperationIdentity");
    expect(systemClient).toContain("createCountryAccountStatusOperationIdentity");
    expect(adapter).toContain("pendingIdentityByFingerprint");
    expect(adapter).toContain("countryAccountStatusFingerprint");
    expect(adapter).toContain("const pending = pendingIdentityByFingerprint.get(fingerprint)");
    expect(adapter).toContain("if (pending) return pending.operationIdentity");
    expect(adapter).toContain("operationIdentity = prepareOrganizerCountryAccountStatusOperationIdentity(input)");
    expect(adapter).toContain("operationIdentity,");
    expect(adapter).toContain("forgetCountryAccountStatusIdentity(operationIdentity.operationId)");
    expect(adapter.indexOf("forgetCountryAccountStatusIdentity(operationIdentity.operationId)")).toBeGreaterThan(
      adapter.indexOf("const receipt = await applyCountryAccountStatusV3"),
    );
  });

  it("rotates identity when reviewed revision, target or reason changes", () => {
    expect(adapter).toContain("currentUpdatedAt: input.currentUpdatedAt");
    expect(adapter).toContain("targetStatus: input.targetStatus");
    expect(adapter).toContain('reason: input.targetStatus === "suspended" ? input.reason?.trim() || null : null');
    expect(adapter).toContain("existingFingerprint !== fingerprint");
  });

  it("keeps legacy mutation authority out of the Organizer route without fossilizing compatibility internals", () => {
    expect(route).not.toContain("useAdminSetCountryAccountStatus,");
    expect(route).not.toContain("admin_set_country_account_status");
    expect(route).toContain("canonical R2 command");
    expect(route).toContain("same operation receipt");
    expect(adapter).not.toContain("admin_set_country_account_status");
  });

  it("surfaces durable operation identity after authoritative success", () => {
    expect(route).toContain("const receipt = await setStatus.mutateAsync");
    expect(route).toContain("setLastOperationId(receipt.operationId)");
    expect(route).toContain("Operation {lastOperationId}");
  });
});
