import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  privilegedSchema: vi.fn(),
}));

// This test never creates a real Supabase client or touches hosted data.
vi.mock("@/integrations/supabase/capabilities.server", () => ({
  requireSolarisCapabilityServer: fixture.requireCapability,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { schema: fixture.privilegedSchema },
}));

import { listJuryIntegrityCasesServer } from "./jury-integrity-admin.server";

beforeEach(() => {
  fixture.requireCapability.mockReset();
  fixture.privilegedSchema.mockReset();
});

describe("Jury integrity evidence service-role authorization", () => {
  it("rejects an absent edition before authorization or private reads", async () => {
    await expect(listJuryIntegrityCasesServer("  ")).rejects.toThrow(
      "Jury Integrity requires an explicit edition scope",
    );
    expect(fixture.requireCapability).not.toHaveBeenCalled();
    expect(fixture.privilegedSchema).not.toHaveBeenCalled();
  });

  it("rejects unauthorized users without querying protected integrity evidence", async () => {
    fixture.requireCapability.mockRejectedValue(
      new Error("Missing Solaris capability: integrity.read"),
    );
    await expect(
      listJuryIntegrityCasesServer("00000000-0000-4000-8000-00000000a791"),
    ).rejects.toThrow("Missing Solaris capability: integrity.read");

    expect(fixture.requireCapability).toHaveBeenCalledExactlyOnceWith(
      "integrity.read",
      "00000000-0000-4000-8000-00000000a791",
    );
    expect(fixture.privilegedSchema).not.toHaveBeenCalled();
  });

  it("normalizes edition scope and enters the protected query only after capability approval", async () => {
    fixture.requireCapability.mockResolvedValue(undefined);
    fixture.privilegedSchema.mockImplementation(() => {
      expect(fixture.requireCapability).toHaveBeenCalledExactlyOnceWith(
        "integrity.read",
        "00000000-0000-4000-8000-00000000a791",
      );
      throw new Error("CONTROLLED_PRIVILEGED_READ_REACHED");
    });

    await expect(
      listJuryIntegrityCasesServer(" 00000000-0000-4000-8000-00000000a791 "),
    ).rejects.toThrow("CONTROLLED_PRIVILEGED_READ_REACHED");
    expect(fixture.privilegedSchema).toHaveBeenCalledTimes(1);
  });
});
