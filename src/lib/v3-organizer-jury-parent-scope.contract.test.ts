import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const boundary = readFileSync("src/routes/_authenticated/admin/jury.tsx", "utf8");
const workspace = readFileSync("src/routes/_authenticated/admin/jury/$slug.tsx", "utf8");
const correctionAuthority = readFileSync(
  "src/lib/v3-organizer-jury-correction-authority.ts",
  "utf8",
);
const shell = readFileSync("src/components/admin/AdminShell.tsx", "utf8");
const windowControl = readFileSync(
  "src/components/admin/JuryVotingWindowControl.tsx",
  "utf8",
);

describe("V3 Organizer Jury parent edition boundary", () => {
  it("verifies the exact Organizer edition before mounting the Jury workspace", () => {
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

  it("protects ballot and roster surfaces behind one parent gate while preserving governed voting authority", () => {
    expect(workspace).toContain("previewOrganizerJuryCorrection");
    expect(workspace).toContain("applyOrganizerJuryCorrection");
    expect(correctionAuthority).toContain('"studio2_jury_vote_correction_preview"');
    expect(correctionAuthority).toContain('"studio2_apply_jury_vote_correction"');
    expect(workspace).not.toContain('rpc("assign_jury_vote"');
    expect(workspace).not.toContain('rpc("clear_jury_point"');
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

  it("keeps roster CRUD separate from the governed official score-correction command", () => {
    expect(workspace).toContain('supabase.from("voters")');
    expect(workspace).toContain('command: action === "assign" ? "jury.vote.correct" : "jury.vote.clear"');
    expect(workspace).toContain("expectedStateHash: pending.preview.stateHash");
    expect(workspace).toContain("correctionReason.trim()");
  });
});