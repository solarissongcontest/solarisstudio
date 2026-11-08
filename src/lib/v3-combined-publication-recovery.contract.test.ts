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
const contextServer = readFileSync(
  "src/integrations/televoting/combined-context.server.ts",
  "utf8",
);
const combinedServer = readFileSync(
  "src/integrations/televoting/combined.server.ts",
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

  it("derives recovery after reload and narrows binding reads", () => {
    expect(route).toContain('"merged-combined-recovery"');
    expect(route).toContain("refetchOnWindowFocus: true");
    expect(contextServer).toContain('.in("remote_round_id", sourceRoundIds)');
    expect(contextServer).not.toContain('.not("show_id", "is", null)');
  });

  it("classifies snapshot failures without claiming canonical recovery failed", () => {
    expect(sync).toContain('snapshotStatus = "incomplete"');
    expect(sync).toContain("Could not refresh Combined Televote public snapshot");
  });

  it("keeps unverifiable and outdated publication states safe", () => {
    expect(route).toContain("Unable to verify official publication data");
    expect(route).toContain("Check status again");
    expect(route).toContain("Official Results are outdated");
    expect(route).toContain("canonicalUnverifiable");
    expect(route).not.toContain('canonicalUnverifiable ? "Retry canonical reconciliation"');
  });

  it("resolves Organizer context before selecting a Combined result", () => {
    expect(functions).toContain("resolveCombinedAggregationsForContext");
    expect(route).toContain("merged-combined-context");
    expect(route).toContain("Multiple valid Combined results");
    expect(route).toContain("No Combined result is associated");
  });

  it("keeps context selection and resolver failures scoped and visible", () => {
    expect(route).toContain("merged-combined-detail");
    expect(route).toContain("search.editionId ?? \"\"");
    expect(route).toContain("search.showId ?? \"\"");
    expect(route).toContain("visibleAggregations");
    expect(combinedServer).toContain("if (isExpectedCombinedContextMismatch(error)) continue;");
    expect(combinedServer).toContain("throw error;");
    expect(combinedServer).not.toContain("} catch {\n      // An aggregation without");
  });
});
