import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Organizer projection authority", () => {
  const server = source("src/lib/v3-organizer-projection.server.ts");
  const fn = source("src/lib/v3-organizer-projection.functions.ts");

  it("requires authenticated Organizer and edition capability checks", () => {
    expect(server).toContain("requireSolarisOrganizerServer()");
    expect(server).toContain('requireSolarisCapabilityServer("edition.read", editionId)');
    expect(server).toContain("createSolarisAuthenticatedClientServer()");
    expect(server).not.toContain("supabaseAdmin");
  });

  it("composes existing canonical task and live systems rather than creating parallel truth", () => {
    expect(server).toContain('loadOrganizerTasksV5(editionId, "all"');
    expect(server).toContain("loadControlRoomModelServer(editionId)");
    expect(server).not.toMatch(/insert\(|update\(|upsert\(|delete\(/);
  });

  it("keeps the browser behind a validated server-function boundary", () => {
    expect(fn).toContain('createServerFn({ method: "POST" })');
    expect(fn).toContain("loadV3OrganizerProjectionServer(data.editionId)");
    expect(fn).not.toMatch(/supabase|\.rpc\(/);
  });
});
