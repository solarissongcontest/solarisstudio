import { describe, expect, it, vi } from "vitest";
import type { ConfirmationRequirement } from "@/integrations/confirmations/admin";
import {
  verifyFreshConfirmationRequirementReview,
  type RequirementActionReview,
} from "@/lib/v3-organizer-confirmation-requirements-r2-review";

const editionId = "edition-a";
const requirement: ConfirmationRequirement = {
  id: "req-a", editionId, countryId: "country-a", countryName: "Aotea", countryCode: "AOT",
  generation: 2, status: "required", reason: "Reconfirm", validFrom: "2026-11-07T00:00:00Z",
  resolvedBySubmissionId: null, resolvedAt: null,
  createdAt: "2026-11-07T00:00:00Z", updatedAt: "2026-11-07T00:00:00Z",
};
const review: RequirementActionReview = { actorId: "organizer-a", editionId, requirement };
function deps(rows: readonly ConfirmationRequirement[] = [requirement]) {
  return {
    getActorId: vi.fn(async (): Promise<string | null> => "organizer-a"),
    verifyRead: vi.fn(async () => true),
    loadRequirements: vi.fn(async () => rows),
  };
}

describe("Organizer Confirmation Requirements R2 fresh actor/revision preflight", () => {
  it("accepts a verified actor, exact edition, capability and unchanged backend requirement", async () => {
    const hooks = deps();
    await expect(verifyFreshConfirmationRequirementReview(review, hooks)).resolves.toBeUndefined();
    expect(hooks.getActorId).toHaveBeenCalledTimes(2);
    expect(hooks.verifyRead).toHaveBeenCalledWith(editionId);
    expect(hooks.loadRequirements).toHaveBeenCalledWith(editionId);
  });

  it("does not query private requirements after a wrong account is detected", async () => {
    const hooks = deps();
    hooks.getActorId.mockResolvedValue("organizer-b");
    await expect(verifyFreshConfirmationRequirementReview(review, hooks)).rejects.toThrow(/identity changed/);
    expect(hooks.verifyRead).not.toHaveBeenCalled();
    expect(hooks.loadRequirements).not.toHaveBeenCalled();
  });

  it("rejects an actor switch during the asynchronous preflight", async () => {
    const actor = vi.fn().mockResolvedValueOnce("organizer-a").mockResolvedValueOnce("organizer-b");
    await expect(verifyFreshConfirmationRequirementReview(review, {
      ...deps(), getActorId: actor,
    })).rejects.toThrow(/identity changed/);
  });

  it("refuses denied or failed edition-scoped read authorization", async () => {
    await expect(verifyFreshConfirmationRequirementReview(review, {
      ...deps(), verifyRead: async () => false,
    })).rejects.toThrow(/authorization changed/);
    await expect(verifyFreshConfirmationRequirementReview(review, {
      ...deps(), verifyRead: async () => { throw new Error("RPC unavailable"); },
    })).rejects.toThrow("RPC unavailable");
  });

  it.each([
    { editionId: "another-edition" }, { countryId: "other" }, { generation: 3 },
    { status: "waived" as const }, { reason: "updated reason" },
    { updatedAt: "2026-11-07T00:01:00Z" },
  ])("rejects changed reviewed backend fields (%j)", async (delta) => {
    await expect(verifyFreshConfirmationRequirementReview(review, deps([{
      ...requirement, ...delta,
    }]))).rejects.toThrow(/requirement changed/);
  });

  it("rejects missing, duplicated and malformed review scope", async () => {
    await expect(verifyFreshConfirmationRequirementReview(review, deps([]))).rejects.toThrow(/requirement changed/);
    await expect(verifyFreshConfirmationRequirementReview(review, deps([requirement,requirement]))).rejects.toThrow(/requirement changed/);
    await expect(verifyFreshConfirmationRequirementReview({
      ...review, editionId: "different",
    }, deps())).rejects.toThrow(/requirement changed/);
  });

  it("refuses an unavailable requirement read rather than continuing as a zero-row list", async () => {
    await expect(verifyFreshConfirmationRequirementReview(review, {
      ...deps(), loadRequirements: async () => { throw new Error("read unavailable"); },
    })).rejects.toThrow("read unavailable");
  });
});
