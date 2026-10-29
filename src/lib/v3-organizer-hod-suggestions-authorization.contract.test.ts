import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const suggestions = read("src/integrations/unified/hod-suggestions.server.ts");
const history = read("src/integrations/unified/hod-history.server.ts");

describe("Organizer HOD suggestion authorization", () => {
  it("requires protected Televote ballot read before private HOD history or privileged clients", () => {
    const ballotCapability = 'requireSolarisCapabilityServer("televote.ballots.read", null)';
    const resolverCall = "loadHodResolverServer()";
    const supabaseImport = 'import("@/integrations/supabase/client.server")';
    const televoteImport = 'import("@/integrations/televoting/client.server")';

    expect(suggestions).toContain(ballotCapability);
    expect(suggestions.indexOf(ballotCapability)).toBeLessThan(suggestions.indexOf(resolverCall));
    expect(suggestions.indexOf(resolverCall)).toBeLessThan(suggestions.indexOf(supabaseImport));
    expect(suggestions.indexOf(resolverCall)).toBeLessThan(suggestions.indexOf(televoteImport));
  });

  it("inherits the parent cross-edition delegation.read boundary before HOD history service-role access", () => {
    const resolver = history.split("export async function loadHodResolverServer()")[1]?.split("export async function getHodHistoryServer")[0] ?? "";

    expect(resolver).toContain('loadServiceRoleDbAfterCapability("delegation.read", null)');
    expect(resolver.indexOf('loadServiceRoleDbAfterCapability("delegation.read", null)')).toBeLessThan(
      resolver.indexOf('.from("delegation_people")'),
    );
  });

  it("keeps the Televote identity projection narrow, server-filtered, and bounded", () => {
    expect(suggestions).toContain('.from("vote_submissions")');
    expect(suggestions).toContain('.select("round_id,country_code,username,username_normalized")');
    expect(suggestions).toContain('.neq("status", "deleted")');
    expect(suggestions).toContain(".limit(50000)");
    expect(suggestions).not.toContain('select("id,round_id,country_code,username,username_normalized,status")');
    expect(suggestions).not.toContain('if (submission.status === "deleted") continue;');
    expect(suggestions).not.toContain("risk_score");
    expect(suggestions).not.toContain("is_vpn");
    expect(suggestions).not.toContain("ip_address");
  });

  it("does not substitute generic Organizer or unrelated integrity authorization", () => {
    expect(suggestions).not.toContain("requireSolarisOrganizerServer");
    expect(suggestions).not.toContain('requireSolarisCapabilityServer("integrity.read"');
    expect(suggestions).not.toContain('requireSolarisCapabilityServer("voting.read"');
    expect(suggestions).toContain('requireSolarisCapabilityServer("televote.ballots.read", null)');
  });

  it("keeps the suggestion path observational", () => {
    expect(suggestions).not.toContain(".insert(");
    expect(suggestions).not.toContain(".update(");
    expect(suggestions).not.toContain(".upsert(");
    expect(suggestions).not.toContain(".delete(");
  });
});
