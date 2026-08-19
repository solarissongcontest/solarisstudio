import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("organizer voting-integrity declarations", () => {
  it("requires organizer access and never exposes network hashes in the normal UI", () => {
    const server = source("src/integrations/televoting/integrity-declarations.server.ts");
    const route = source("src/routes/televoting/admin/integrity-declarations.tsx");

    expect(server).toContain("requireMergedTelevotingAdminServer");
    expect(server).toContain('eq("requires_attestation", true)');
    expect(route).not.toContain("ip_hash");
    expect(route).not.toContain("fingerprint_hash");
    expect(route).not.toContain("device_token_hash");
  });

  it("shows the evidence, declaration and submission trail without treating a flag as guilt", () => {
    const route = source("src/routes/televoting/admin/integrity-declarations.tsx");

    expect(route).toContain("An automatic flag is evidence for review, not a finding of misconduct by itself");
    expect(route).toContain("Evidence shown to voter");
    expect(route).toContain("Declaration & submission trail");
    expect(route).toContain("Recorded declaration");
    expect(route).toContain("Unsigned warnings are not violations");
    expect(route).toContain("Real-world IP geography is never expected to match a fictional Solaris country");
  });

  it("keeps signed declarations discoverable from organizer search", () => {
    const palette = source("src/components/admin/AdminCommandPalette.tsx");

    expect(palette).toContain("Voting integrity declarations");
    expect(palette).toContain("/televoting/admin/integrity-declarations");
  });
});
