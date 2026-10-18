import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const boundary = readFileSync(
  "src/routes/_authenticated/admin/voting-system.tsx",
  "utf8",
);
const workspace = readFileSync(
  "src/routes/_authenticated/admin/voting-system/$slug.tsx",
  "utf8",
);

describe("V3 Organizer Voting Rules parent edition boundary", () => {
  it("verifies the exact Organizer edition before mounting the legacy rules workspace", () => {
    expect(boundary).toContain("useAdminContext()");
    expect(boundary).toContain("selectOrganizerEdition");
    expect(boundary).toContain("routeSlug !== selectedEdition.slug");
    expect(boundary).toContain('data-v3-organizer-voting-rules-scope="mismatch"');
    expect(boundary).toContain("return <Outlet />;");
  });

  it("fails closed when edition context is missing, unavailable, or mismatched", () => {
    expect(boundary).toContain('title="Choose an edition"');
    expect(boundary).toContain('title="Voting Rules edition context could not be verified"');
    expect(boundary).toContain('title="Voting Rules edition context mismatch"');
    expect(boundary).toContain("Rule reads and saves stay blocked");
  });

  it("protects the current direct voting-config mutation surface behind the parent gate", () => {
    expect(workspace).toContain("integrations/supabase/client");
    expect(workspace).toContain("VotingEditor");
    expect(workspace).toContain("rerankExistingResults");
    expect(boundary).not.toContain("integrations/supabase/client");
    expect(boundary).not.toContain(".from(");
    expect(boundary).not.toContain(".rpc(");
  });

  it("does not claim the parent guard replaces the canonical versioned VotingConfig command", () => {
    expect(workspace).not.toContain("executeGovernedVotingConfigCommand");
    expect(boundary).not.toContain("operationId");
    expect(boundary).not.toContain("idempotencyKey");
  });
});
