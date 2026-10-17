import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/jury-integrity.tsx",
  "utf8",
);
const serverFn = readFileSync(
  "src/integrations/jury-voting/jury-integrity-admin.functions.ts",
  "utf8",
);
const server = readFileSync(
  "src/integrations/jury-voting/jury-integrity-admin.server.ts",
  "utf8",
);

describe("V3 Organizer Jury Integrity edition scope", () => {
  it("requires an explicit valid edition at the server-function boundary", () => {
    expect(serverFn).toContain('createServerFn({ method: "POST" })');
    expect(serverFn).toContain("Jury Integrity requires a valid edition id");
    expect(serverFn).toContain("listJuryIntegrityCasesServer(data.editionId)");
  });

  it("filters canonical evidence and referenced shows by the selected edition on the server", () => {
    expect(server).toContain('listJuryIntegrityCasesServer(editionId: string)');
    expect(server).toContain('.eq("canonical_edition_id", scopedEditionId)');
    expect(server).toContain('.select("id,name,edition_id").eq("edition_id", scopedEditionId)');
    expect(server).toContain("Jury Integrity returned evidence outside the selected edition scope");
    expect(server).toContain("Jury Integrity evidence references a show outside the selected edition scope");
    expect(server).toContain("editionId: scopedEditionId");
  });

  it("binds the Organizer route query to current context and rechecks returned scope", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain('["jury-integrity-v5", editionId ?? "unscoped"]');
    expect(route).toContain("enabled: Boolean(editionId)");
    expect(route).toContain("loadCases({ data: { editionId } })");
    expect(route).toContain("result.editionId !== editionId");
    expect(route).toContain("row.editionId !== editionId");
    expect(route).toContain('title="Choose an edition"');
    expect(route).toContain("will not merge jury cases across editions");
  });
});
