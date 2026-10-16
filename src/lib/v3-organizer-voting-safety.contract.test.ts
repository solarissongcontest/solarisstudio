import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const juryWindow = readFileSync(
  "src/components/admin/JuryVotingWindowControl.tsx",
  "utf8",
);
const juryRoute = readFileSync(
  "src/routes/_authenticated/admin/jury/$slug.tsx",
  "utf8",
);
const televoteServer = readFileSync(
  "src/integrations/televoting/rounds.server.ts",
  "utf8",
);

describe("V3 Organizer Voting safety contracts", () => {
  it("keeps Jury open/close on previewed, versioned and idempotent server authority", () => {
    expect(juryWindow).toContain("previewJuryVotingStatusChange");
    expect(juryWindow).toContain("applyJuryVotingStatusChange");
    expect(juryWindow).toContain("expectedVersion");
    expect(juryWindow).toContain("operationId");
    expect(juryWindow).toContain("idempotencyKey");
    expect(juryWindow).toContain("AdminConfirmSheet");
    expect(juryWindow).not.toContain('.from("shows").update');
  });

  it("keeps Televote open/close on the governed merged-round status command", () => {
    expect(televoteServer).toContain("previewMergedRoundStatusChange");
    expect(televoteServer).toContain("applyMergedRoundStatusChange");
    expect(televoteServer).toContain("studio2_round_status_change_preview");
    expect(televoteServer).toContain("studio2_apply_round_status_change");
    expect(televoteServer).toContain("p_expected_version");
    expect(televoteServer).toContain("p_operation_id");
    expect(televoteServer).toContain("p_idempotency_key");
  });

  it("keeps the legacy manual Jury correction path visible to migration guards until System replaces it", () => {
    // This is intentionally not asserted as V3-safe. Issue #582 tracks moving
    // these authorized legacy RPCs behind the canonical operation/receipt model.
    expect(juryRoute).toContain('rpc("assign_jury_vote"');
    expect(juryRoute).toContain('rpc("clear_jury_point"');
  });
});
