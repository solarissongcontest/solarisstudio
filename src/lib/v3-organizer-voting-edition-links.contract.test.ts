import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/televoting/admin/editions.tsx", "utf8");
const readServer = readFileSync(
  "src/integrations/televoting/edition-links.server.ts",
  "utf8",
);
const readFunction = readFileSync(
  "src/integrations/televoting/edition-links.functions.ts",
  "utf8",
);
const syncFunction = readFileSync(
  "src/integrations/televoting/solaris-sync.functions.ts",
  "utf8",
);
const routeMap = readFileSync("src/lib/permission-route-map.ts", "utf8");

describe("V3 Organizer voting edition-link boundary", () => {
  it("keeps ordinary page load and Refresh read-only", () => {
    expect(route).toContain("getMergedTelevotingEditionLinks");
    expect(route).toContain('queryKey: ["merged-televoting-edition-links"]');
    expect(route).toContain("queryFn: () => getEditionLinks()");
    expect(route).not.toContain("queryFn: () => syncCatalog()");
    expect(readFunction).toContain('createServerFn({ method: "GET" })');

    for (const mutation of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(readServer).not.toContain(mutation);
    }
  });

  it("makes reconciliation an explicit confirmed Organizer action", () => {
    expect(route).toContain("const repairMutation = useMutation({");
    expect(route).toContain("mutationFn: () => syncCatalog()");
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain('title="Repair voting edition links?"');
    expect(route).toContain('confirmLabel="Repair edition links"');
  });

  it("reports missing links, missing projections and projection drift instead of hiding them", () => {
    expect(readServer).toContain('"linked" | "drift" | "missing_remote" | "unlinked"');
    expect(route).toContain('return <AdminStatus tone="attention">Unlinked</AdminStatus>');
    expect(route).toContain("Missing projection");
    expect(route).toContain("Needs repair");
    expect(route).toContain("Viewing this page is read-only");
  });

  it("binds privileged diagnostic reads to canonical voting.read before service clients are loaded", () => {
    expect(routeMap).toContain('rule(["/televoting/admin"], "voting.read")');
    expect(readServer).toContain('requireSolarisCapabilityServer("voting.read")');
    expect(readServer).not.toContain("requireMergedTelevotingAdminServer");
    expect(readServer).not.toContain(
      'import { televotingAdmin } from "@/integrations/televoting/client.server"',
    );

    const capabilityCheck = readServer.indexOf('requireSolarisCapabilityServer("voting.read")');
    expect(capabilityCheck).toBeGreaterThan(-1);
    expect(capabilityCheck).toBeLessThan(readServer.indexOf("await Promise.all([solarisDb(), televotingDb()])"));
    expect(readServer).toContain('await import("@/integrations/supabase/client.server")');
    expect(readServer).toContain('await import("@/integrations/televoting/client.server")');
  });

  it("requires voting.manage before the explicit repair path can import the privileged writer", () => {
    expect(syncFunction).toContain('requireSolarisCapabilityServer("voting.manage")');
    expect(syncFunction.indexOf('requireSolarisCapabilityServer("voting.manage")'))
      .toBeLessThan(syncFunction.indexOf('"@/integrations/televoting/solaris-sync.server"'));
    expect(syncFunction).toContain("ensureCanonicalTelevotingEditionsServer");
  });
});