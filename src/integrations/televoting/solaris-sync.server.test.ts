import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  requireMergedAdmin: vi.fn(),
  remoteRead: vi.fn(),
  localRead: vi.fn(),
  saveRoundCountries: vi.fn(),
}));

// No network or hosted Supabase client can be instantiated in this test.
vi.mock("@/integrations/supabase/capabilities.server", () => ({
  requireSolarisCapabilityServer: fixture.requireCapability,
}));
vi.mock("@/integrations/televoting/admin-session.server", () => ({
  requireMergedTelevotingAdminServer: fixture.requireMergedAdmin,
}));
vi.mock("@/integrations/televoting/client.server", () => ({
  televotingAdmin: { from: fixture.remoteRead },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: fixture.localRead },
}));
vi.mock("@/integrations/televoting/entries.server", () => ({
  saveMergedRoundCountriesServer: fixture.saveRoundCountries,
}));

import {
  getMergedRoundSolarisSourceServer,
  syncMergedRoundFromSolarisServer,
} from "./solaris-sync.server";

beforeEach(() => {
  for (const key of Object.keys(fixture) as Array<keyof typeof fixture>) {
    fixture[key].mockReset();
  }
});

describe("Televote source inspection vs repair authority", () => {
  it("denies a source read before touching remote/local service-role clients", async () => {
    fixture.requireCapability.mockRejectedValue(new Error("Missing voting.read"));
    await expect(getMergedRoundSolarisSourceServer("round-1"))
      .rejects.toThrow("Missing voting.read");

    expect(fixture.requireCapability).toHaveBeenCalledTimes(1);
    expect(fixture.requireCapability).toHaveBeenCalledWith("voting.read", null);
    expect(fixture.requireMergedAdmin).not.toHaveBeenCalled();
    expect(fixture.remoteRead).not.toHaveBeenCalled();
    expect(fixture.localRead).not.toHaveBeenCalled();
    expect(fixture.saveRoundCountries).not.toHaveBeenCalled();
  });

  it("denies repair before reconciliation or any vote-country mutation", async () => {
    fixture.requireCapability.mockRejectedValue(new Error("Missing voting.manage"));
    await expect(syncMergedRoundFromSolarisServer({ roundId: "round-1" }))
      .rejects.toThrow("Missing voting.manage");

    expect(fixture.requireCapability).toHaveBeenCalledTimes(1);
    expect(fixture.requireCapability).toHaveBeenCalledWith("voting.manage", null);
    expect(fixture.requireMergedAdmin).not.toHaveBeenCalled();
    expect(fixture.remoteRead).not.toHaveBeenCalled();
    expect(fixture.localRead).not.toHaveBeenCalled();
    expect(fixture.saveRoundCountries).not.toHaveBeenCalled();
  });

  it("uses read permission rather than silently demanding management permission", async () => {
    fixture.requireCapability.mockResolvedValue(undefined);
    fixture.remoteRead.mockImplementation(() => {
      throw new Error("CONTROLLED_READ_SENTINEL");
    });

    await expect(getMergedRoundSolarisSourceServer("round-1"))
      .rejects.toThrow("CONTROLLED_READ_SENTINEL");
    expect(fixture.requireCapability).toHaveBeenCalledWith("voting.read", null);
    expect(fixture.requireCapability).not.toHaveBeenCalledWith("voting.manage", null);
    expect(fixture.remoteRead).toHaveBeenCalledTimes(1);
    expect(fixture.saveRoundCountries).not.toHaveBeenCalled();
  });
});
