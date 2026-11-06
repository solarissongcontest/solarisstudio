import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const server = read("src/integrations/televoting/backtest.server.ts");
const adapter = read("src/integrations/televoting/backtest.functions.ts");
const page = read("src/routes/televoting/admin/backtest.tsx");

describe("V3 Organizer historical Televote backtest least privilege", () => {
  it("requires global protected-ballot read before either privileged import", () => {
    const guard = server.indexOf('await requireSolarisCapabilityServer("televote.ballots.read", null)');
    const client = server.indexOf('import("@/integrations/televoting/client.server")');
    const conversion = server.indexOf('import("@/integrations/televoting/conversion.server")');
    const query = server.indexOf('.from("rounds")');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(client).toBeGreaterThan(guard);
    expect(conversion).toBeGreaterThan(guard);
    expect(query).toBeGreaterThan(client);
    expect(server).not.toContain("requireMergedTelevotingAdminServer");
    expect(server).not.toContain('import { televotingAdmin }');
    expect(server).not.toContain('} from "@/integrations/televoting/conversion.server"');
  });

  it("does not widen the global ballot grant to unrelated Organizer or integrity capabilities", () => {
    expect(server).toContain('requireSolarisCapabilityServer("televote.ballots.read", null)');
    expect(server).not.toContain('requireSolarisCapabilityServer("voting.read"');
    expect(server).not.toContain('requireSolarisCapabilityServer("integrity.read"');
  });

  it("keeps source queries bounded and the browser behind the server adapter", () => {
    expect(server).toContain(".limit(Math.max(1, Math.min(100");
    expect(adapter).toContain('createServerFn({ method: "POST" })');
    expect(adapter).toContain("runHistoricalTelevoteBacktestServer(data)");
    expect(adapter).not.toMatch(/supabaseAdmin|televotingAdmin|\.from\(|\.rpc\(/);
  });

  it("does not mutate official Results, voting rounds or ballots", () => {
    expect(page).toContain("No official result is changed");
    expect(page).toContain("read-only simulation");
    expect(server).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
