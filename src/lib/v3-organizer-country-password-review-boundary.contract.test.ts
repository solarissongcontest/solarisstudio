import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminCountryPasswordPanel.tsx"),
  "utf8",
);

const auth = readFileSync(
  resolve(process.cwd(), "src/lib/country-auth.ts"),
  "utf8",
);

describe("V3 Organizer country password replacement review", () => {
  it("validates locally and freezes the exact account + password into review instead of mutating on submit", () => {
    expect(panel).toContain("type PendingPasswordReview");
    expect(panel).toContain("const submit = (event: React.FormEvent<HTMLFormElement>) =>");
    expect(panel).toContain("userId: account.user_id");
    expect(panel).toContain("countryName: account.country_name");
    expect(panel).toContain("email: account.email");
    expect(panel).toContain("password,");
    expect(panel).toContain("Review password change");
    expect(panel).not.toContain("const savePromise = adminSetSolarisPassword(account.user_id, password)");
  });

  it("requires an explicit typed-country review before the Organizer-only identity function is invoked", () => {
    expect(panel).toContain("<AdminConfirmSheet");
    expect(panel).toContain('confirmLabel="Replace password"');
    expect(panel).toContain("confirmationText={pendingReview?.countryName}");
    expect(panel).toContain("Type ${pendingReview.countryName} to confirm the password replacement");
    expect(panel).toContain("adminSetSolarisPassword(review.userId, review.password)");
    expect(auth).toContain('invokeFunction<PasswordUpdatePayload>("admin-country-password"');
  });

  it("fails closed if the selected account identity changes while review is open", () => {
    expect(panel).toContain("account.user_id !== review.userId");
    expect(panel).toContain("account.country_name !== review.countryName");
    expect(panel).toContain("account.email !== review.email");
    expect(panel).toContain("selected country account changed while the password review was open");
  });

  it("never displays the reviewed password and keeps remaining authority limitations explicit", () => {
    expect(panel).toContain("The new password is deliberately not shown in this review");
    expect(panel).toContain("does not claim to revoke existing sessions");
    expect(panel).toContain("versioned/idempotent credential-change receipt");
    expect(panel).not.toContain("{pendingReview.password}");
  });
});
