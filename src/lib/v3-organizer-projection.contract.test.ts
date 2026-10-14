import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Organizer projection authority", () => {
  const server = source("src/lib/organizer-v3-projection.server.ts");
  const fn = source("src/lib/v3-organizer-projection.functions.ts");

  it("uses the authoritative edition-scoped capability context", () => {
    expect(server).toContain('requireSolarisCapabilityServer("edition.read", editionId)');
    expect(server).toContain("actorId: capability.userId");
    expect(server).toContain("createSolarisAuthenticatedClientServer()");
    expect(server).not.toContain("requireSolarisOrganizerServer");
    expect(server).not.toContain("supabaseAdmin");
  });

  it("composes existing canonical task and live systems rather than creating parallel truth", () => {
    expect(server).toContain('loadOrganizerTasksV5(editionId, "all"');
    expect(server).toContain("loadControlRoomModelServer(editionId)");
    expect(server).not.toMatch(/insert\(|update\(|upsert\(|delete\(/);
  });

  it("keeps the complete workflow-owned operational schedule in the server projection", () => {
    expect(server).toContain('from("submission_rounds")');
    expect(server).toContain('from("jury_voting_windows")');
    expect(server).toContain('from("televoting_round_bindings")');
    expect(server).toContain('.schema("televoting")');
    expect(server).toContain('from("participants")');
    expect(server).toContain('"scheduled_publish_at"');
    expect(server).toContain('from("studio2_official_notices")');
    expect(server).toContain('from("admin_deadlines")');
    expect(server).toContain("does not control a Solaris workflow");
  });

  it("keeps the browser behind a validated server-function boundary", () => {
    expect(fn).toContain('createServerFn({ method: "POST" })');
    expect(fn).toContain('import("@/lib/organizer-v3-projection.server")');
    expect(fn).toContain("loadV3OrganizerProjectionServer(data.editionId)");
    expect(fn).not.toMatch(/supabase|\.rpc\(/);
  });
});
