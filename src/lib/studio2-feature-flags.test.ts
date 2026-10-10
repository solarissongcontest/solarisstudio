import { describe, expect, it } from "vitest";

import {
  isStudio2FeatureEnabled,
  normalizeStudio2FeatureEditionId,
} from "./studio2-feature-flags";

describe("Studio 2 feature flag edition scope", () => {
  it.each([undefined, null, "", "   ", "\t\n"])(
    "normalizes unresolved edition scope %j to null",
    (editionId) => {
      expect(normalizeStudio2FeatureEditionId(editionId)).toBeNull();
    },
  );

  it("preserves a resolved edition id", () => {
    const editionId = "11111111-1111-4111-8111-111111111111";
    expect(normalizeStudio2FeatureEditionId(`  ${editionId}  `)).toBe(editionId);
  });

  it("never sends an empty string to the uuid RPC parameter", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const client = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: true, error: null };
      },
    };

    await expect(
      isStudio2FeatureEnabled("fantasy_ssc", "   ", client),
    ).resolves.toBe(true);

    expect(calls).toEqual([
      {
        name: "studio2_feature_enabled",
        args: {
          p_key: "fantasy_ssc",
          p_edition_id: null,
        },
      },
    ]);
  });
});
