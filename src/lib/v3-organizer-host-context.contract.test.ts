import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/routes/_authenticated/admin/hosts.tsx",
  "utf8",
);
const service = readFileSync("src/lib/studio2-host-management.ts", "utf8");
const registry = readFileSync("src/lib/v3-organizer-capability-registry.ts", "utf8");

describe("V3 Organizer Host Management edition context", () => {
  it("requires the exact selected Organizer edition and never substitutes the newest edition", () => {
    expect(source).toContain(
      "const edition = editions.find((item) => item.id === editionId) ?? null;",
    );
    expect(source).not.toContain(
      "[...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]",
    );
    expect(source).toContain("enabled: Boolean(resolvedEditionId)");
    expect(source).toContain("queryFn: () => loadStudio2HostManagement(resolvedEditionId)");
    expect(source).toContain('title="Choose an edition"');
    expect(source).toContain(
      "Solaris will not substitute the newest or globally active edition when the saved context is missing or stale.",
    );
  });

  it("rejects Host snapshot data outside the requested edition before the UI can consume it", () => {
    const loadStart = service.indexOf("export async function loadStudio2HostManagement");
    const parse = service.indexOf("const snapshot = parseHostManagementSnapshot(data);", loadStart);
    const rootScope = service.indexOf("snapshot.edition.id !== editionId", parse);
    const bidScope = service.indexOf("snapshot.bids.some((bid) => bid.editionId !== editionId)", parse);
    const operationsScope = service.indexOf("snapshot.operations.editionId !== editionId", parse);
    const returned = service.indexOf("return snapshot;", operationsScope);

    expect(loadStart).toBeGreaterThanOrEqual(0);
    expect(parse).toBeGreaterThan(loadStart);
    expect(rootScope).toBeGreaterThan(parse);
    expect(bidScope).toBeGreaterThan(parse);
    expect(operationsScope).toBeGreaterThan(parse);
    expect(returned).toBeGreaterThan(operationsScope);
  });

  it("blocks commands if scope changes after the operator opens a Host action", () => {
    expect(source).toContain("resolvedEditionId !== editionId");
    expect(source).toContain("snapshot?.edition.id !== resolvedEditionId");
    expect(source).toContain(
      "Edition context changed before the Host Management command. Reopen the selected edition and review the change again.",
    );
    expect(source).toContain(
      "!snapshot.bids.some((bid) => bid.id === input.bidId && bid.editionId === resolvedEditionId)",
    );
  });

  it("clears stale mutable Host UI when the edition scope changes", () => {
    expect(source).toContain("setPending(null);");
    expect(source).toContain("setBidSheet(null);");
    expect(source).toContain("setEvaluationTarget(null);");
    expect(source).toContain("setShowTarget(null);");
    expect(source).toContain("}, [resolvedEditionId]);");
    expect(source).toContain("open={Boolean(edition && pending)}");
    expect(source).toContain("open={Boolean(edition && bidSheet)}");
    expect(source).toContain("open={Boolean(edition && evaluationTarget)}");
    expect(source).toContain("open={Boolean(edition && showTarget)}");
  });

  it("records Host Management as building without claiming parity or cutover", () => {
    expect(registry).toContain('id === "current-edition-host"');
  });
});
