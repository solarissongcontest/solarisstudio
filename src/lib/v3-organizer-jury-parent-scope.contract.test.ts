import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const boundary = readFileSync("src/routes/_authenticated/admin/jury.tsx", "utf8");
const workspace = readFileSync("src/routes/_authenticated/admin/jury/$slug.tsx", "utf8");

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

  it("protects the existing ballot and roster mutation surface behind one parent gate", () => {
    for (const authority of [
      'rpc("assign_jury_vote"',
      'rpc("clear_jury_point"',
      "studio2_apply_jury_voting_status",
    ]) {
      expect(workspace).toContain(authority);
    }
    expect(boundary).not.toContain("integrations/supabase/client");
    expect(boundary).not.toContain(".rpc(");
    expect(boundary).not.toContain(".from(");
  });

  it("does not claim that the legacy Jury correction and roster paths are final V3 authority", () => {
    expect(workspace).toContain('rpc("assign_jury_vote"');
    expect(workspace).toContain('rpc("clear_jury_point"');
    expect(workspace).not.toContain("executeGovernedJuryCorrectionCommand");
  });
});
