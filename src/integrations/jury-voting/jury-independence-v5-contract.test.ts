import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("jury independence v5 contract", () => {
  it("routes official jury preflight through v5", () => {
    const functions = source("src/integrations/jury-voting/jury-voting.functions.ts");
    expect(functions).toContain("runJuryIntegrityPreflightV5Server");
    expect(functions).toContain("jury-integrity-v5.server");
  });

  it("keeps detailed detector evidence server-side instead of teaching voters how to evade it", () => {
    const functions = source("src/integrations/jury-voting/jury-voting.functions.ts");
    const server = source("src/integrations/jury-voting/jury-integrity-v5.server.ts");
    expect(functions).toContain("findings: []");
    expect(functions).toContain("Math.ceil(report.riskScore / 10)");
    expect(server).toContain("admin_evidence");
    expect(server).toContain("strongestTarget");
    expect(server).toContain("voter_reason_categories");
  });

  it("never automatically reduces jury scores or sanctions a voter", () => {
    const server = source("src/integrations/jury-voting/jury-integrity-v5.server.ts");
    expect(server).toContain("automaticSanction: false");
    expect(server).toContain("automaticVoteReduction: false");
    expect(server).not.toContain("update({ points:");
    expect(server).not.toContain("delete().eq");
  });

  it("uses deviation, reciprocity, coordination, network, cross-channel and persistence families", () => {
    const server = source("src/integrations/jury-voting/jury-integrity-v5.server.ts");
    for (const family of [
      "history",
      "deviation",
      "reciprocity",
      "coordination",
      "network",
      "crossChannel",
      "persistence",
    ]) {
      expect(server).toContain(`${family}:`);
    }
  });
});
