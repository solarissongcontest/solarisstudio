import { describe, expect, it, vi } from "vitest";

import {
  verifyFreshCountryPasswordReview,
  type CountryPasswordReviewScope,
} from "@/lib/v3-organizer-country-password-fresh-review";
import type { AdminCountryAccount } from "@/lib/country-account";

const review: CountryPasswordReviewScope = {
  actorId: "organizer-a",
  userId: "country-owner",
  countryId: "country-a",
  countryName: "Aotea",
  email: "delegate@example.test",
  status: "active",
  suspensionReason: null,
  updatedAt: "2026-11-07T12:00:00.000Z",
};
const account: AdminCountryAccount = {
  user_id: review.userId,
  country_id: review.countryId,
  country_name: review.countryName,
  email: review.email,
  status: review.status,
  suspension_reason: review.suspensionReason,
  updated_at: review.updatedAt,
  created_at: "2026-11-01T10:00:00.000Z",
  short_code: "AOT",
  flag_image: null,
};

function dependencies(
  accounts: readonly AdminCountryAccount[] = [account],
  getActorId = vi.fn(async (): Promise<string | null> => review.actorId),
) {
  return { getActorId, readAccounts: vi.fn(async () => accounts) };
}

describe("Organizer country password mutation fresh-review preflight", () => {
  it("accepts only the exact currently authenticated actor and account revision", async () => {
    const deps = dependencies();
    await expect(verifyFreshCountryPasswordReview(review, deps)).resolves.toBeUndefined();
    expect(deps.getActorId).toHaveBeenCalledTimes(2);
    expect(deps.readAccounts).toHaveBeenCalledTimes(1);
  });

  it("does not even read private account data for a different current actor", async () => {
    const deps = dependencies([account], vi.fn(async () => "organizer-b"));
    await expect(verifyFreshCountryPasswordReview(review, deps)).rejects.toThrow("Organizer identity changed");
    expect(deps.readAccounts).not.toHaveBeenCalled();
  });

  it("rejects a session switch during the asynchronous directory read", async () => {
    const actors = ["organizer-a", "organizer-b"];
    const deps = dependencies([account], vi.fn(async () => actors.shift() ?? null));
    await expect(verifyFreshCountryPasswordReview(review, deps)).rejects.toThrow("Organizer identity changed");
  });

  it.each([
    { user_id: "different-owner" },
    { country_id: "different-country" },
    { country_name: "Renamed" },
    { email: "different@example.test" },
    { status: "suspended" as const },
    { suspension_reason: "Moderation hold" },
    { updated_at: "2026-11-07T12:01:00.000Z" },
  ])("rejects changed country-account identity/state (%j)", async (delta) => {
    const deps = dependencies([{ ...account, ...delta }]);
    await expect(verifyFreshCountryPasswordReview(review, deps)).rejects.toThrow("Country account state changed");
  });

  it("rejects missing, duplicated, and cross-linked account records", async () => {
    for (const accounts of [
      [],
      [account, account],
      [{ ...account, country_id: "other" }, { ...account, user_id: "someone-else" }],
    ]) {
      await expect(verifyFreshCountryPasswordReview(review, dependencies(accounts))).rejects.toThrow("Country account state changed");
    }
  });

  it("fails closed on invalid review scope, read errors, and unavailable directory data", async () => {
    await expect(verifyFreshCountryPasswordReview({ ...review, updatedAt: "" }, dependencies())).rejects.toThrow("Country account state changed");
    await expect(verifyFreshCountryPasswordReview(review, {
      getActorId: async () => review.actorId,
      readAccounts: async () => { throw new Error("RPC unavailable"); },
    })).rejects.toThrow("RPC unavailable");
    await expect(verifyFreshCountryPasswordReview(review, {
      getActorId: async () => review.actorId,
      readAccounts: async () => null as unknown as AdminCountryAccount[],
    })).rejects.toThrow("Country account state changed");
  });
});
