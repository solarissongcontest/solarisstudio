import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const suggestions = read("src/integrations/unified/hod-suggestions.server.ts");
const body = suggestions.slice(suggestions.indexOf("export async function getHodIdentitySuggestionsServer()"));

describe("Organizer HOD identity suggestion authorization", () => {
  it("requires both global private-read capabilities before resolving HOD history", () => {
    const delegation = 'requireSolarisCapabilityServer("delegation.read", null)';
    const ballots = 'requireSolarisCapabilityServer("televote.ballots.read", null)';
    const resolver = "const hod = await loadHodResolverServer()";

    expect(body).toContain(delegation);
    expect(body).toContain(ballots);
    expect(body.indexOf(delegation)).toBeLessThan(body.indexOf(ballots));
    expect(body.indexOf(ballots)).toBeLessThan(body.indexOf(resolver));
  });

  it("does not import either privileged service client before authorization", () => {
    const ballotGuard = body.indexOf('requireSolarisCapabilityServer("televote.ballots.read", null)');
    const resolver = body.indexOf("const hod = await loadHodResolverServer()");
    const primaryClient = body.indexOf('import("@/integrations/supabase/client.server")');
    const votingClient = body.indexOf('import("@/integrations/televoting/client.server")');

    expect(ballotGuard).toBeGreaterThan(-1);
    expect(primaryClient).toBeGreaterThan(resolver);
    expect(votingClient).toBeGreaterThan(resolver);
    expect(suggestions).not.toContain('import { supabaseAdmin }');
    expect(suggestions).not.toContain('import { televotingAdmin }');
  });

  it("reads only bounded identity suggestion fields from raw votes", () => {
    expect(body).toContain('.from("vote_submissions")');
    expect(body).toContain('.select("id,round_id,country_code,username,username_normalized,status")');
    expect(body).toContain(".limit(50000)");
    expect(body).toContain('if (submission.status === "deleted") continue;');
    expect(body).not.toContain("risk_score");
    expect(body).not.toContain("ip_address");
    expect(body).not.toContain("is_vpn");
  });

  it("does not substitute generic organizer roles or unrelated permissions", () => {
    expect(body).not.toContain("requireSolarisOrganizerServer");
    expect(body).not.toContain('requireSolarisCapabilityServer("integrity.read"');
    expect(body).not.toContain('requireSolarisCapabilityServer("voting.read"');
    expect(body).toContain('requireSolarisCapabilityServer("delegation.read", null)');
    expect(body).toContain('requireSolarisCapabilityServer("televote.ballots.read", null)');
  });

  it("remains an observational read", () => {
    expect(body).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
