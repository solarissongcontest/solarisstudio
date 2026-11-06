import { beforeEach, describe, expect, it, vi } from "vitest";

const editionId = "00000000-0000-4000-8000-00000000a791";
const fixture = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  privilegedSchema: vi.fn(),
}));

// No Supabase client is constructed and this test never contacts hosted data.
vi.mock("@/integrations/supabase/capabilities.server", () => ({
  getSolarisCapabilitiesServer: fixture.getCapabilities,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { schema: fixture.privilegedSchema },
}));

import { listJuryIntegrityCasesServer } from "./jury-integrity-admin.server";

beforeEach(() => {
  fixture.getCapabilities.mockReset();
  fixture.privilegedSchema.mockReset();
});

describe("Jury integrity evidence service-role authorization", () => {
  it("rejects an absent edition before resolving permissions or private reads", async () => {
    await expect(listJuryIntegrityCasesServer("  ")).rejects.toThrow(
      "Jury Integrity requires an explicit edition scope",
    );
    expect(fixture.getCapabilities).not.toHaveBeenCalled();
    expect(fixture.privilegedSchema).not.toHaveBeenCalled();
  });

  it("does not access protected evidence when the identity lookup fails", async () => {
    fixture.getCapabilities.mockRejectedValue(new Error("Not authenticated"));
    await expect(listJuryIntegrityCasesServer(editionId)).rejects.toThrow("Not authenticated");
    expect(fixture.getCapabilities).toHaveBeenCalledTimes(1);
    expect(fixture.getCapabilities).toHaveBeenCalledWith(editionId);
    expect(fixture.privilegedSchema).not.toHaveBeenCalled();
  });

  it.each([
    [[], "integrity.read"],
    [["jury.ballots.read"], "integrity.read"],
    [["integrity.read"], "jury.ballots.read"],
  ])("denies insufficient scope %o before any privileged query", async (capabilities, missing) => {
    fixture.getCapabilities.mockResolvedValue({ userId: "fixture-user", authoritative: true, capabilities });
    await expect(listJuryIntegrityCasesServer(editionId)).rejects.toThrow(
      `Solaris capability required: ${missing}`,
    );
    expect(fixture.getCapabilities).toHaveBeenCalledTimes(1);
    expect(fixture.getCapabilities).toHaveBeenCalledWith(editionId);
    expect(fixture.privilegedSchema).not.toHaveBeenCalled();
  });

  it("normalizes edition scope and enters protected reads only after both permissions", async () => {
    fixture.getCapabilities.mockResolvedValue({
      userId: "fixture-user",
      authoritative: true,
      capabilities: ["integrity.read", "jury.ballots.read"],
    });
    fixture.privilegedSchema.mockImplementation(() => {
      expect(fixture.getCapabilities).toHaveBeenCalledTimes(1);
    expect(fixture.getCapabilities).toHaveBeenCalledWith(editionId);
      throw new Error("CONTROLLED_PRIVILEGED_READ_REACHED");
    });
    await expect(listJuryIntegrityCasesServer(` ${editionId} `)).rejects.toThrow(
      "CONTROLLED_PRIVILEGED_READ_REACHED",
    );
    expect(fixture.privilegedSchema).toHaveBeenCalledTimes(1);
  });
});
