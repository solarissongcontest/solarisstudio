import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/country-accounts.tsx"),
  "utf8",
);

const accountService = readFileSync(
  resolve(process.cwd(), "src/lib/country-account.ts"),
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
  });

  it("forces a fresh directory read and fails closed if account state changed while review was open", () => {
    expect(route).toContain("const refreshed = await refetchAccounts()");
    expect(route).toContain("const refreshedData = refreshed.data");
    expect(route).toContain("refreshed.error || !refreshedData?.schemaReady");
    expect(route).toContain("refreshedData.accounts.find((account) => account.user_id === review.userId)");
    expect(route).toContain("liveAccount.country_id !== review.countryId");
    expect(route).toContain("liveAccount.country_name !== review.countryName");
    expect(route).toContain("liveAccount.email !== review.email");
    expect(route).toContain("liveAccount.status !== review.currentStatus");
    expect(route).toContain("liveAccount.suspension_reason !== review.currentSuspensionReason");
    expect(route).toContain("liveAccount.updated_at !== review.currentUpdatedAt");
    expect(route).toContain("Nothing was changed");
    expect(route).not.toContain("data?.accounts.find((account) => account.user_id === review.userId)");
  });

  it("requires typing the exact country before either access change", () => {
    expect(route).toContain("confirmationText={pendingReview?.countryName}");
    expect(route).toContain("Type ${pendingReview.countryName} to confirm the access change");
  });

  it("keeps the existing server RPC as the only account-status mutation authority and states the remaining race", () => {
    expect(route).toContain("await setStatus.mutateAsync({");
    expect(accountService).toContain('supabase.rpc("admin_set_country_account_status"');
    expect(route).not.toContain('supabase.rpc("admin_set_country_account_status"');
    expect(route).not.toContain('.from("country_accounts")');
    expect(route).toContain("not a version-bound/idempotent V3 command");
    expect(route).toContain("a narrow race remains");
  });
});