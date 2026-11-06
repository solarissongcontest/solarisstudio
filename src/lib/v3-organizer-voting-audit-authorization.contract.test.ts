import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/integrations/televoting/audit.server.ts", "utf8");
const page = readFileSync("src/routes/televoting/admin/audit-log.tsx", "utf8");
const fn = readFileSync("src/integrations/televoting/audit.functions.ts", "utf8");
const routeCapabilities = readFileSync("src/lib/permission-route-map.ts", "utf8");

describe("Organizer voting audit authorization and recovery", () => {
  it("requires global voting.read before loading the privileged cross-edition audit client", () => {
    const check = server.indexOf('requireSolarisCapabilityServer("voting.read", null)');
    const service = server.indexOf('import("@/integrations/televoting/client.server")');
    const read = server.indexOf('.from("admin_audit_log")');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(service).toBeGreaterThan(check);
    expect(read).toBeGreaterThan(service);
    expect(server).not.toContain("requireMergedTelevotingAdminServer");
    expect(routeCapabilities).toContain('"voting.read"');
  });

  it("keeps browser reads inside a bounded server function with no direct privileged client", () => {
    expect(fn).toContain('createServerFn({ method: "POST" })');
    expect(fn).toContain("listMergedAuditLogServer(data)");
    expect(fn).toContain("Math.min(Number(data.limit), 1000)");
    expect(fn).not.toMatch(/supabaseAdmin|televotingAdmin|\.from\(|\.rpc\(/);
    expect(server).toContain(".limit(Math.max(1, Math.min(filters.limit ?? 500, 1000)))");
  });

  it("isolates confidential audit cache by actor and disables private automatic polling", () => {
    expect(page).toContain("useAuthenticatedUser().id");
    expect(page).toContain('queryKey: ["merged-televoting-audit", actorId, action, targetType]');
    expect(page).toContain("enabled: Boolean(actorId)");
    expect(page).toContain("gcTime: 0");
    expect(page).toContain("retry: false");
    expect(page).toContain("refetchInterval: false");
    expect(page).toContain("refetchOnWindowFocus: false");
    expect(page).toContain("refetchOnReconnect: false");
    expect(page).not.toContain('queryKey: ["merged-televoting-admin"]');
  });

  it("allows explicit retry and does not present a failed read as a genuine empty audit", () => {
    expect(page).toContain("isFetching, refetch");
    expect(page).toContain("onClick={() => void refetch()}");
    expect(page).toContain("disabled={isFetching}");
    expect(page).toContain('aria-busy={isFetching}');
    expect(page).toContain("Retry audit history");
    expect(page).toContain('error ? "Audit history unavailable"');
    expect(page).toContain("error instanceof Error");
  });

  it("does not write official voting, Results or audit history state", () => {
    expect(server).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
