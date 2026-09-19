import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_IA_V3_BETA_KEY,
  clearPublicIaV3BetaOverride,
  enablePublicIaV3BetaOverride,
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
  it("lets Beta 3 opt in locally without a user id", async () => {
    const storage = memoryStorage();
    enablePublicIaV3BetaOverride(storage as Storage);
    expect(storage.getItem(PUBLIC_IA_V3_BETA_KEY)).toBe("1");
    expect(readPublicIaV3BetaOverride(storage as Storage)).toBe(true);

    const featureEnabled = vi.fn();
    await expect(
      resolvePublicIaV3Enabled({
        userId: null,
        betaOverride: true,
        featureEnabled: featureEnabled as never,
      }),
    ).resolves.toBe(true);
    expect(featureEnabled).not.toHaveBeenCalled();
  });

  it("keeps ordinary signed-out visitors on legacy navigation", async () => {
    await expect(
      resolvePublicIaV3Enabled({
        userId: null,
        betaOverride: false,
        featureEnabled: vi.fn() as never,
      }),
    ).resolves.toBe(false);
  });

  it("uses the persisted flag for signed-in users and fails closed", async () => {
    const enabled = vi.fn().mockResolvedValue(true);
    await expect(
      resolvePublicIaV3Enabled({
        userId: "user-1",
        betaOverride: false,
        featureEnabled: enabled as never,
      }),
    ).resolves.toBe(true);

    const broken = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      resolvePublicIaV3Enabled({
        userId: "user-1",
        betaOverride: false,
        featureEnabled: broken as never,
      }),
    ).resolves.toBe(false);
  });

  it("can clear the Beta 3 override", () => {
    const storage = memoryStorage();
    enablePublicIaV3BetaOverride(storage as Storage);
    clearPublicIaV3BetaOverride(storage as Storage);
    expect(readPublicIaV3BetaOverride(storage as Storage)).toBe(false);
  });
});
