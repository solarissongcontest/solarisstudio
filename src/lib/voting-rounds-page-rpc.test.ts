import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Voting Rounds & entries page runtime contract", () => {
  it("uses the Organizer edition and the dedicated one-query page loader", () => {
    const page = source("components/televoting/VotingRoundsView.tsx");

    expect(page).toContain("useAdminContext");
    expect(page).toContain("getMergedTelevotingRoundsPage");
    expect(page).toContain('["merged-televoting-rounds-page", editionId]');
    expect(page).toContain("getRoundsPage({ data: { editionId } })");
    expect(page).not.toContain("getMergedTelevotingAdmin");
    expect(page).not.toContain("getMergedTelevotingRounds,");
    expect(page).not.toContain("<select");
  });

  it("loads the page through one service-only database RPC", () => {
    const functions = source("integrations/televoting/rounds.functions.ts");

    expect(functions).toContain("getMergedTelevotingRoundsPage");
    expect(functions).toContain('"admin_rounds_page_overview"');
    expect(functions).toContain("p_solaris_edition_id: data.editionId");
    expect(functions).toContain("requireMergedTelevotingAdminServer");
  });

  it("does not modify the legacy shared rounds server to solve a page-read problem", () => {
    const server = source("integrations/televoting/rounds.server.ts");

    expect(server).toContain("ensureCanonicalTelevotingEditionsServer");
    expect(server).toContain("autoSyncDraftTelevotingRoundsForEditionServer");
  });

  it("keeps the page RPC invoker-scoped and browser-inaccessible", () => {
    const migration = source("../supabase/migrations/20260908201316_add_televoting_rounds_page_overview.sql");

    expect(migration).toContain("security invoker");
    expect(migration).toContain("revoke execute on function televoting.admin_rounds_page_overview(uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function televoting.admin_rounds_page_overview(uuid) to service_role");
  });
});
