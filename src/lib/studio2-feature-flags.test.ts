import { describe, expect, it, vi } from "vitest";

import { isStudio2FeatureEnabled } from "./studio2-feature-flags";

describe("Studio 2 feature flag scope", () => {
  it.each([undefined, null, "", "   "])(
    "normalizes an absent edition scope (%s) to null before calling PostgREST",
    async (editionId) => {
      const rpc = vi.fn(async () => ({ data: false, error: null }));

      await expect(
        isStudio2FeatureEnabled("fantasy_ssc", editionId, { rpc }),
      ).resolves.toBe(false);

      expect(rpc).toHaveBeenCalledWith("studio2_feature_enabled", {
        p_key: "fantasy_ssc",
        p_edition_id: null,
      });
    },
  );

  it("preserves a real edition UUID after trimming accidental whitespace", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const editionId = "f7849b69-3d8f-4a93-a5e1-4ec81f9d8cb1";

    await expect(
      isStudio2FeatureEnabled("fantasy_ssc", `  ${editionId}  `, { rpc }),
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith("studio2_feature_enabled", {
      p_key: "fantasy_ssc",
      p_edition_id: editionId,
    });
  });
});
