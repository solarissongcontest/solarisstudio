import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const boundary = readFileSync("src/routes/_authenticated/admin/jury.tsx", "utf8");
const workspace = readFileSync("src/routes/_authenticated/admin/jury/$slug.tsx", "utf8");
const shell = readFileSync("src/components/admin/AdminShell.tsx", "utf8");
const windowControl = readFileSync(
  "src/components/admin/JuryVotingWindowControl.tsx",
  "utf8",
);

describe("V3 Organizer Jury parent edition boundary", () => {
  it("verifies the exact Organizer edition before mounting the legacy Jury workspace", () => {
    expect(boundary).toContain("useAdminContext()");
    expect(boundary).toContain("selectOrganizerEdition");
    expect(boundary).toContain("routeSlug !== selectedEdition.slug");
    expect(boundary).toContain('data-v3-organizer-jury-scope="mismatch"');
    expect(boundary).toContain("return <Outlet />;");
  });

  it("fails closed when edition context is missing, unavailable, or mismatched", () => {
    expect(boundary).toContain('title="Choose an edition"');
    expect(boundary).toContain('title="Jury edition context could not be verified"');
    expect(boundary).toContain('title="Jury edition context mismatch"');
    expect(boundary).toContain("Ballot and roster operations stay blocked");
  });

  it("protects the existing ballot and roster surfaces behind one parent gate while preserving governed window authority", () => {
    expect(workspace).toContain('lifecycleRpc("studio2_jury_vote_change_preview"');
    expect(workspace).toContain("executeJuryVoteChange(command,client)");
    expect(workspace).toContain("runRetainedJuryCommand(actorId,intent,sessionStorage");
    expect(shell).toContain("JuryVotingWindowControl");
    expect(windowControl).toContain('rpc("studio2_jury_window_change_preview"');
    expect(windowControl).toContain('rpc("studio2_apply_jury_voting_status"');
    expect(windowControl).toContain("p_expected_version");
    expect(windowControl).toContain("p_operation_id");
    expect(windowControl).toContain("p_idempotency_key");
    expect(boundary).not.toContain("integrations/supabase/client");
    expect(boundary).not.toContain(".rpc(");
    expect(boundary).not.toContain(".from(");
  });

  it("keeps manual score entry behind the canonical command with reviewed edition, show and version", () => {
    expect(workspace).not.toMatch(/\.rpc\(\s*["'](?:assign_jury_vote|clear_jury_point)["']/);
    expect(workspace).toContain("editionId: edition.id");
    expect(workspace).toContain("showId: selectedShow.id");
    expect(workspace).toContain("expectedVersion: preview.expectedVersion");
    expect(workspace).toContain("operationId: operation.operationId");
    expect(workspace).toContain("idempotencyKey: operation.idempotencyKey");
  });
});
