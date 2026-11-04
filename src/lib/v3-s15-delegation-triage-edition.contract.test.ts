import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const addon = readFileSync("src/components/confirmations/DelegationColourOverview.tsx", "utf8");
const reader = readFileSync("src/integrations/confirmations/v3-projections.ts", "utf8");

describe("S15 Organizer delegation triage read isolation", () => {
  it("does not download the global Confirmation response archive", () => {
    expect(addon).not.toContain('rpc("admin_confirmation_responses")');
    expect(addon).toContain("loadAllConfirmationResponsesForEdition<ResponseRow>(editionId)");
    expect(reader).toContain('rpc("admin_confirmation_responses_v2"');
    expect(reader).toContain("p_edition_id: editionId");
  });

  it("derives the exact edition from Organizer context, never a DOM select", () => {
    expect(addon).toContain("const { editionId } = useAdminContext()");
    expect(addon).not.toContain("setEditionId(select.value)");
    expect(addon).not.toContain("const onChange =");
    expect(addon).toContain("if (!editionId) return");
    expect(addon).toContain("setRows([])");
    expect(addon).toContain("[editionId]");
    expect(addon).toContain("if (alive) setRows(batch.rows)");
    expect(addon).toContain("editionId ? rows.filter");
    expect(addon).not.toContain("!editionId || row.editions?.id === editionId");
  });

  it("keeps the visual status meanings without browser-owned review mutation", () => {
    expect(addon).toContain("next[responseCardState(row)] += 1");
    expect(addon).toContain("card.dataset.delegationState = state");
    expect(addon).not.toContain('.from("submissions").update');
    expect(addon).not.toContain("admin_confirmation_set_reviewed");
  });
});
