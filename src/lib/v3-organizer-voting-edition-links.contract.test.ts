import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const route = read("src/routes/televoting/admin/editions.tsx");
const readServer = read("src/integrations/televoting/edition-links.server.ts");
const readFunction = read("src/integrations/televoting/edition-links.functions.ts");
const repairFunction = read("src/integrations/televoting/solaris-sync.functions.ts");
const permissionMap = read("src/lib/permission-route-map.ts");

describe("V3 Organizer voting edition-link boundary", () => {
  it("keeps ordinary page load and Refresh observational", () => {
    expect(route).toContain("getMergedTelevotingEditionLinks");
    expect(route).toContain('queryKey: ["merged-televoting-edition-links", actorId]');
    expect(route).toContain("queryFn: () => getEditionLinks()");
    expect(route).not.toContain("queryFn: () => syncCatalog()");
    expect(readFunction).toContain('createServerFn({ method: "GET" })');
    for (const mutation of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(readServer).not.toContain(mutation);
    }
  });

  it("guards privileged diagnostic clients with global voting.read before either client is opened", () => {
    const check = readServer.indexOf('requireSolarisCapabilityServer("voting.read", null)');
    const loadSolaris = readServer.indexOf("    solarisDb(),", check);
    const loadVoting = readServer.indexOf('import("@/integrations/televoting/client.server")', check);
    const firstQuery = readServer.indexOf('.from("editions")', check);
    expect(check).toBeGreaterThan(-1);
    expect(loadSolaris).toBeGreaterThan(check);
    expect(loadVoting).toBeGreaterThan(check);
    expect(firstQuery).toBeGreaterThan(loadVoting);
    expect(readServer).not.toContain("requireMergedTelevotingAdminServer");
    expect(readServer).not.toContain('import { televotingAdmin }');
    expect(permissionMap).toContain('"voting.read"');
  });

  it("requires global voting.manage before loading the explicit repair writer", () => {
    const handler = repairFunction.slice(repairFunction.indexOf("export const syncMergedTelevotingEditionCatalog"));
    const guard = handler.indexOf('requireSolarisCapabilityServer("voting.manage", null)');
    const writer = handler.indexOf('"@/integrations/televoting/solaris-sync.server"');
    expect(guard).toBeGreaterThan(-1);
    expect(writer).toBeGreaterThan(guard);
    expect(handler).toContain("ensureCanonicalTelevotingEditionsServer()");
  });

  it("keeps account-isolated diagnostic readback and explicit failure recovery", () => {
    expect(route).toContain("useAuthenticatedUser().id");
    expect(route).toContain('queryKey: ["merged-televoting-edition-links", actorId]');
    expect(route).toContain("gcTime: 0");
    expect(route).toContain("retry: false");
    expect(route).toContain("refetchInterval: false");
    expect(route).toContain("refetchOnWindowFocus: false");
    expect(route).toContain("refetchOnReconnect: false");
    expect(route).toContain("Boolean(error) || repairMutation.isPending");
    expect(route).toContain('onClick={() => void refresh()}');
    expect(route).not.toContain('queryKey: ["merged-televoting-admin"]');
  });

  it("shows drift and requires explicit repair confirmation", () => {
    expect(readServer).toContain('"linked" | "drift" | "missing_remote" | "unlinked"');
    expect(route).toContain("Missing projection");
    expect(route).toContain("Needs repair");
    expect(route).toContain("Viewing this page is read-only");
    expect(route).toContain("const repairMutation = useMutation({");
    expect(route).toContain("mutationFn: () => syncCatalog()");
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain('title="Repair voting edition links?"');
    expect(route).toContain('confirmLabel="Repair edition links"');
  });
});
