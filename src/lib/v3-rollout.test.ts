import { describe, expect, it } from "vitest";

import { DEFAULT_V3_ROLLOUT_RULE, evaluateV3Rollout } from "./v3-rollout";

const USER = {
  userId: "user-1",
  editionId: "22",
  isOrganizer: false,
};

describe("V3 rollout policy", () => {
  it("is disabled by default", () => {
    expect(DEFAULT_V3_ROLLOUT_RULE.stage).toBe("disabled");
    expect(evaluateV3Rollout(undefined, USER)).toEqual({
      enabled: false,
      stage: "disabled",
      reason: "disabled",
    });
  });

  it("requires an explicit user allowlist in preview stage", () => {
    expect(
      evaluateV3Rollout(
        { stage: "preview", userIds: ["someone-else"] },
        USER,
      ),
    ).toMatchObject({ enabled: false, reason: "preview_not_allowed" });

    expect(
      evaluateV3Rollout(
        { stage: "preview", userIds: ["user-1"] },
        USER,
      ),
    ).toMatchObject({ enabled: true, reason: "enabled" });
  });

  it("supports edition-scoped cohorts", () => {
    expect(
      evaluateV3Rollout(
        { stage: "cohort", userIds: ["user-1"], editionIds: ["23"] },
        USER,
      ),
    ).toMatchObject({ enabled: false, reason: "edition_not_in_cohort" });

    expect(
      evaluateV3Rollout(
        { stage: "cohort", userIds: ["user-1"], editionIds: ["22"] },
        USER,
      ),
    ).toMatchObject({ enabled: true, reason: "enabled" });
  });

  it("can restrict organizer previews without trusting a display-role name", () => {
    const rule = { stage: "preview" as const, userIds: ["user-1"], organizersOnly: true };

    expect(evaluateV3Rollout(rule, USER)).toMatchObject({
      enabled: false,
      reason: "organizer_required",
    });
    expect(evaluateV3Rollout(rule, { ...USER, isOrganizer: true })).toMatchObject({
      enabled: true,
      reason: "enabled",
    });
  });

  it("allows a fully enabled rollout without client-side opt-in", () => {
    expect(evaluateV3Rollout({ stage: "enabled" }, USER)).toEqual({
      enabled: true,
      stage: "enabled",
      reason: "enabled",
    });
  });
});
