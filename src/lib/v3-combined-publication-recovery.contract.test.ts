import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const functions = readFileSync(
  "src/integrations/televoting/combined.functions.ts",
  "utf8",
);
const route = readFileSync(
  "src/routes/televoting/admin/combined.tsx",
  "utf8",
);
const sync = readFileSync(
  "src/integrations/televoting/results-sync.server.ts",
  "utf8",
);

describe("Combined publication recovery", () => {
  it("uses the governed Solaris reconciliation command", () => {
    expect(functions).toContain("reconcilePublishedCombinedResults");
    expect(functions).toContain("trySyncPublishedCombinedResultsToSolarisServer");
    expect(functions).toContain("expectedEditionId");
    expect(functions).toContain("expectedShowId");
  });

  it("exposes truthful recovery after partial publication", () => {
    expect(route).toContain("Publication committed, but Solaris Results still need reconciliation.");
    expect(route).toContain("Retry canonical reconciliation");
    expect(sync).toContain('"v3_reconcile_published_televote"');
    expect(route).not.toContain("v3_reconcile_published_televote\" as a correction");
  });
});
