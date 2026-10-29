import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(
  "src/integrations/televoting/solaris-sync.server.ts",
  "utf8",
);

function section(start: string, end?: string) {
  const startIndex = server.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? server.indexOf(end, startIndex + start.length) : -1;
  return server.slice(startIndex, endIndex < 0 ? undefined : endIndex);
}

describe("V3 Televote Solaris sync read/write boundary", () => {
  it("keeps ordinary round-source inspection read-only and capability-gated", () => {
    const read = section(
      "export async function getMergedRoundSolarisSourceServer",
      "export async function syncMergedRoundFromSolarisServer",
    );
    const capability = read.indexOf(
      'await requireSolarisCapabilityServer("voting.read", null);',
    );
    const resolver = read.indexOf("resolveRoundSource(roundId)");

    expect(capability).toBeGreaterThan(-1);
    expect(resolver).toBeGreaterThan(capability);
    expect(read).not.toContain("ensureCanonicalTelevotingEditionsServer");
    expect(read).not.toContain("requireMergedTelevotingAdminServer");
    expect(read).not.toContain(".insert(");
    expect(read).not.toContain(".update(");
    expect(read).not.toContain(".upsert(");
    expect(read).not.toContain(".delete(");
  });

  it("makes the shared resolver surface missing/drifted links instead of repairing them", () => {
    const resolver = section(
      "async function resolveLinkedCanonicalEdition",
      "export async function getMergedRoundSolarisSourceServer",
    );

    expect(resolver).toContain('.from("integration_links")');
    expect(resolver).toContain("Repair edition links before continuing");
    expect(resolver).toContain(
      "This voting round binding points to a different Solaris edition",
    );
    expect(resolver).not.toContain("ensureCanonicalTelevotingEditionsServer");
    expect(resolver).not.toContain(".upsert(");
    expect(resolver).not.toContain(".insert(");
    expect(resolver).not.toContain(".update(");
    expect(resolver).not.toContain(".delete(");
  });

  it("leaves legacy catalog reconciliation explicitly separated from the read resolver", () => {
    const repair = section(
      "export async function ensureCanonicalTelevotingEditionsServer",
      "async function resolveLinkedCanonicalEdition",
    );
    const resolver = section(
      "async function resolveLinkedCanonicalEdition",
      "export async function getMergedRoundSolarisSourceServer",
    );

    expect(repair).toContain("Legacy catalog reconciliation writer");
    expect(repair).toContain("requireMergedTelevotingAdminServer");
    expect(repair).toContain(".upsert(");
    expect(resolver).not.toContain(".upsert(");
    expect(resolver).not.toContain(".insert(");
    expect(resolver).not.toContain(".update(");
    expect(resolver).not.toContain(".delete(");
  });

  it("requires voting.manage before line-up synchronization and preserves the open-round guard", () => {
    const sync = section("export async function syncMergedRoundFromSolarisServer");
    const capability = sync.indexOf(
      'await requireSolarisCapabilityServer("voting.manage", null);',
    );
    const compatibility = sync.indexOf("await requireMergedTelevotingAdminServer();");
    const repair = sync.indexOf("await ensureCanonicalTelevotingEditionsServer();");
    const source = sync.indexOf("resolveRoundSource(data.roundId)");

    expect(capability).toBeGreaterThan(-1);
    expect(compatibility).toBeGreaterThan(capability);
    expect(repair).toBeGreaterThan(compatibility);
    expect(source).toBeGreaterThan(repair);
    expect(sync).toContain('if (source.round.status === "open")');
    expect(sync).toContain("Close the voting round before syncing its Solaris line-up");
  });
});
