import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_IA_V3_BETA_KEY,
  clearPublicIaV3BetaOverride,
  enablePublicIaV3BetaOverride,
  nextPublicIaRolloutStage,
  previousPublicIaRolloutStage,
  readPublicIaV3BetaOverride,
  resolvePublicIaV3Enabled,
} from "./public-ia-rollout";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("public IA v3 rollout", () => {
  it("lets Beta 3 opt in only during beta stage", async () => {
    const storage = memoryStorage();
    enablePublicIaV3BetaOverride(storage as Storage);
    expect(storage.getItem(PUBLIC_IA_V3_BETA_KEY)).toBe("1");
    expect(readPublicIaV3BetaOverride(storage as Storage)).toBe(true);

    const featureEnabled = vi.fn();
    await expect(
      resolvePublicIaV3Enabled({
        userId: null,
        betaOverride: true,
        stageLoader: async () => "beta",
        featureEnabled: featureEnabled as never,
      }),
    ).resolves.toBe(true);
    expect(featureEnabled).not.toHaveBeenCalled();

    await expect(
      resolvePublicIaV3Enabled({
        userId: null,
        betaOverride: true,
        stageLoader: async () => "organizers",
        featureEnabled: featureEnabled as never,
      }),
    ).resolves.toBe(false);
  });

  it("keeps ordinary signed-out visitors on legacy before everyone stage", async () => {
    for (const stage of ["organizers", "beta", "signed_in"] as const) {
      await expect(
        resolvePublicIaV3Enabled({
          userId: null,
          betaOverride: false,
          stageLoader: async () => stage,
          featureEnabled: vi.fn().mockResolvedValue(true) as never,
        }),
      ).resolves.toBe(false);
    }
  });

  it("enables all signed-in users at signed-in stage", async () => {
    const featureEnabled = vi.fn().mockResolvedValue(true);
    await expect(
      resolvePublicIaV3Enabled({
        userId: "user-1",
        betaOverride: false,
        stageLoader: async () => "signed_in",
        featureEnabled: featureEnabled as never,
      }),
    ).resolves.toBe(true);
    expect(featureEnabled).toHaveBeenCalledWith("public_ia_v3");
  });

  it("enables anonymous visitors only at everyone stage", async () => {
    const featureEnabled = vi.fn().mockResolvedValue(true);
    await expect(
      resolvePublicIaV3Enabled({
        userId: null,
        betaOverride: false,
        stageLoader: async () => "everyone",
        featureEnabled: featureEnabled as never,
      }),
    ).resolves.toBe(true);
  });

  it("fails closed when stage or feature loading fails", async () => {
    await expect(
      resolvePublicIaV3Enabled({
        userId: "user-1",
        stageLoader: async () => {
          throw new Error("stage unavailable");
        },
        featureEnabled: vi.fn() as never,
      }),
    ).resolves.toBe(false);

    await expect(
      resolvePublicIaV3Enabled({
        userId: "user-1",
        stageLoader: async () => "signed_in",
        featureEnabled: vi.fn().mockRejectedValue(new Error("flag unavailable")) as never,
      }),
    ).resolves.toBe(false);
  });

  it("supports explicit forward and rollback stage navigation", () => {
    expect(nextPublicIaRolloutStage("organizers")).toBe("beta");
    expect(nextPublicIaRolloutStage("beta")).toBe("signed_in");
    expect(nextPublicIaRolloutStage("everyone")).toBeNull();
    expect(previousPublicIaRolloutStage("everyone")).toBe("signed_in");
    expect(previousPublicIaRolloutStage("disabled")).toBeNull();
  });

  it("can clear the Beta 3 override", () => {
    const storage = memoryStorage();
    enablePublicIaV3BetaOverride(storage as Storage);
    clearPublicIaV3BetaOverride(storage as Storage);
    expect(readPublicIaV3BetaOverride(storage as Storage)).toBe(false);
  });
});
