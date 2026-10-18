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

  it("authenticates the read on the server before using service credentials", () => {
    expect(readServer).toContain("await requireMergedTelevotingAdminServer()");
    expect(readServer.indexOf("await requireMergedTelevotingAdminServer()"))
      .toBeLessThan(readServer.indexOf("await solarisDb()"));
  });
});
