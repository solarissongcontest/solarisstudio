import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const routeSource = source("src/routes/_authenticated/admin/next-in-line.tsx");

describe("V3 Organizer Next in Line exact-edition safety", () => {
  it("never widens the response read when Organizer edition context is missing", () => {
    expect(routeSource).toContain("if (!editionId) {");
    expect(routeSource).toContain('.rpc("admin_confirmation_next_in_line", { _edition_id: editionId })');
    expect(routeSource).not.toContain("_edition_id: editionId || null");
    expect(routeSource).toContain('title="Select an edition"');
    expect(routeSource).toContain("Solaris will not fetch or combine responses until an exact Organizer edition is selected.");
  });

  it("rejects cross-edition response, snapshot and preview payloads", () => {
    expect(routeSource).toContain("nextInLineRowsForEdition(result.data, editionId)");
    expect(routeSource).toContain("nextInLineSnapshotForEdition(result.data, editionId)");
    expect(routeSource).toContain("nextInLinePreviewForEdition(previewResult.data, operationEditionId)");
    expect(routeSource).toContain("row.edition_id !== editionId");
    expect(routeSource).toContain("snapshot.editionId !== editionId");
    expect(routeSource).toContain("preview.editionId !== editionId");
  });

  it("invalidates stale previews and refuses cross-context apply", () => {
    expect(routeSource).toContain("editionIdRef.current = editionId");
    expect(routeSource).toContain("setPendingWindowChange(null)");
    expect(routeSource).toContain("editionIdRef.current !== operationEditionId");
    expect(routeSource).toContain("pendingWindowChange.editionId !== operationEditionId");
    expect(routeSource).toContain("pendingWindowChange.preview.editionId !== operationEditionId");
    expect(routeSource).toContain("Organizer edition changed after this preview");
    expect(routeSource).toContain("scope: { editionId: operationEditionId }");
    expect(routeSource).toContain("p_edition_id: operationEditionId");
  });
});
