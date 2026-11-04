import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sync = read("src/routes/confirmations/admin/sync.tsx");
const reader = read("src/integrations/confirmations/v3-projections.ts");
const lineup = read("src/lib/admin-lineup.functions.ts");

describe("S15 Confirmation Sync privacy and reviewed snapshot boundary", () => {
  it("only loads the exact Organizer-selected edition through bounded System pages", () => {
    expect(sync).toContain("loadAllConfirmationResponsesForEdition<ResponseRow>(organizerEditionId)");
    expect(sync).toContain("loadAllConfirmationResponsesForEdition<ResponseRow>(review.editionId)");
    expect(sync).not.toContain('rpc("admin_confirmation_responses")');
    expect(sync).not.toContain('from("submissions")');
    expect(sync).toContain("setRows([])");
    expect(sync).toContain('setResponseStateVersion("")');
    expect(sync).toContain("setResponseStateVersion(batch.stateVersion)");
    expect(reader).toContain('rpc("admin_confirmation_responses_v2"');
    expect(reader).toContain("p_edition_id: editionId");
    expect(reader).toContain("maxPages = 25");
    expect(reader).toContain("page.stateVersion !== stateVersion");
  });

  it("refuses a reviewed sync when edition, response identities or canonical state changes", () => {
    expect(sync).toContain("organizerEditionIdRef.current !== review.editionId");
    expect(sync).toContain("responseStateVersion,");
    expect(sync).toContain("currentBatch.stateVersion !== review.responseStateVersion");
    expect(sync).toContain("Nothing was applied. Review the current round again.");
    expect(sync).toContain("liveResponseIds.some((id, index) => id !== review.responseIds[index])");
    expect(sync).toContain("liveTargets.editionId !== review.editionId");
    expect(sync).toContain("liveShow.name !== review.showName");
  });

  it("does not claim that legacy multi-step writes have become governed/atomic", () => {
    expect(sync).toContain("legacy multi-step sync");
    expect(sync).toContain("System #598 remains the blocker");
    expect(lineup).toContain('from("participants")');
    expect(lineup).not.toContain('rpc("v3_execute_show_lineup_operation"');
    expect(sync).toContain("addToShow");
  });
});
