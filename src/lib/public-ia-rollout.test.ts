import { describe, expect, it, vi } from "vitest";

import { resolvePublicIaV3Enabled } from "./public-ia-rollout";

function clientReturning(data: unknown) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("public IA v3 rollout", () => {
  it("uses the new public IA for anonymous and signed-in visitors when globally enabled", async () => {
    const client = clientReturning(true);

    await expect(resolvePublicIaV3Enabled({ client })).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("public_ia_v3_enabled");
  });

  it("uses legacy navigation only when the global emergency rollback is explicitly disabled", async () => {
    const client = clientReturning(false);

    await expect(resolvePublicIaV3Enabled({ client })).resolves.toBe(false);
  });

  it("fails open to the new public IA when the rollout endpoint is unavailable", async () => {
    const client = {
      rpc: vi.fn().mockRejectedValue(new Error("network")),
    };

    await expect(resolvePublicIaV3Enabled({ client })).resolves.toBe(true);
  });

  it("treats malformed or missing rollout data as enabled rather than reviving legacy chrome", async () => {
    await expect(resolvePublicIaV3Enabled({ client: clientReturning(null) })).resolves.toBe(true);
    await expect(resolvePublicIaV3Enabled({ client: clientReturning(undefined) })).resolves.toBe(true);
  });
});
