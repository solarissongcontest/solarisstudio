import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: () => null,
}));
vi.mock("@/integrations/confirmations/public-runtime.server", () => ({
  createConfirmationPublicRuntimeClient: vi.fn(),
}));
vi.mock("@/integrations/supabase/organizer.server", () => ({
  createSolarisAuthenticatedClientServer: vi.fn(),
}));

import { evaluateV3Rollout } from "@/integrations/v3/rollout-probe.server";

function fakeClient(globalResponse: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async (_name: string, args?: Record<string, unknown>) => {
    if (args?.p_key === "solaris_app_v3") return globalResponse;
    return { data: true, error: null };
  });
  return {
    client: { rpc, from: vi.fn() } as unknown as Parameters<typeof evaluateV3Rollout>[0],
    rpc,
  };
}

describe("V3 rollout global gate short-circuit", () => {
  it.each([
    { label: "disabled", response: { data: false, error: null } },
    { label: "invalid", response: { data: null, error: null } },
    { label: "unavailable", response: { data: null, error: { message: "unavailable" } } },
  ])("fails closed after exactly one RPC when global V3 is $label", async ({ response }) => {
    const { client, rpc } = fakeClient(response);
    const probe = await evaluateV3Rollout(client, "edition-a");
    expect(probe).toMatchObject({
      enabled: false,
      confirmationEnabled: false,
      juryEnabled: false,
      resultsEnabled: false,
      editionId: "edition-a",
      userId: null,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("studio2_feature_enabled", {
      p_key: "solaris_app_v3",
      p_edition_id: "edition-a",
    });
  });

  it("evaluates all fifteen per-capability flags only after an affirmative global V3 decision", async () => {
    const { client, rpc } = fakeClient({ data: true, error: null });
    const probe = await evaluateV3Rollout(client, "edition-b");
    expect(probe.enabled).toBe(true);
    expect(probe.juryEnabled).toBe(true);
    expect(probe.confirmationEnabled).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(16);
    expect(rpc.mock.calls.every(([name, args]) =>
      name === "studio2_feature_enabled" && args?.p_edition_id === "edition-b",
    )).toBe(true);
  });
});
