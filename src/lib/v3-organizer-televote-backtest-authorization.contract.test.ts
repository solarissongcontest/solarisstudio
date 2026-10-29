import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Televote historical backtest authorization", () => {
  const server = source("src/integrations/televoting/backtest.server.ts");
  const fn = source("src/integrations/televoting/backtest.functions.ts");

  it("requires the canonical global ballot-read capability before privileged Televote access", () => {
    const capabilityCheck = server.indexOf(
      'requireSolarisCapabilityServer("televote.ballots.read")',
    );
    const privilegedQuery = server.indexOf('televotingAdmin\n    .from("rounds")');

    expect(capabilityCheck).toBeGreaterThan(-1);
    expect(privilegedQuery).toBeGreaterThan(capabilityCheck);
    expect(server).not.toContain("requireMergedTelevotingAdminServer");
  });

  it("does not silently widen a cross-edition backtest to an edition-local capability", () => {
    expect(server).toContain(
      'requireSolarisCapabilityServer("televote.ballots.read")',
    );
    expect(server).not.toContain(
      'requireSolarisCapabilityServer("televote.ballots.read",',
    );
  });

  it("keeps the browser behind the server-function boundary", () => {
    expect(fn).toContain('createServerFn({ method: "POST" })');
    expect(fn).toContain(
      '"@/integrations/televoting/backtest.server"',
    );
    expect(fn).toContain("runHistoricalTelevoteBacktestServer(data)");
    expect(fn).not.toMatch(/supabaseAdmin|televotingAdmin|\.from\(|\.rpc\(/);
  });

  it("remains read-only", () => {
    expect(server).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
