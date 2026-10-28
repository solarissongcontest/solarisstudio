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

  it("loads the page through one organizer-authenticated database RPC", () => {
    const functions = source("integrations/televoting/rounds.functions.ts");

    expect(functions).toContain("getMergedTelevotingRoundsPage");
    expect(functions).toContain('"admin_rounds_page_overview"');
    expect(functions).toContain("p_solaris_edition_id: data.editionId");
    expect(functions).toContain("requireMergedTelevotingAdminServer");
  });

  it("keeps the legacy loader read-only while retaining the dedicated page-read authority", () => {
    const server = source("integrations/televoting/rounds.server.ts");
    const start = server.indexOf("export async function getMergedTelevotingRoundsServer()");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = server.indexOf("\nexport async function ", start + 1);
    const loader = server.slice(start, end < 0 ? undefined : end);
    // Original invariant: page reads must not acquire a competing mutation
    // boundary. The canonical cutover also removed the loader's implicit sync.
    expect(loader).toContain("await requireMergedTelevotingAdminServer()");
    expect(loader).toContain('.from("rounds")');
    expect(loader).not.toContain("autoSyncDraftTelevotingRoundsForEditionServer");
    expect(loader).not.toContain("ensureCanonicalTelevotingEditionsServer()");
    expect(loader).not.toMatch(/\.(?:insert|update|delete|upsert|rpc)\(/);
  });

  it("keeps the page RPC invoker-scoped and explicitly organizer-gated", () => {
    const migration = source("../supabase/migrations/20260908202116_fix_televoting_rounds_page_overview_permissions.sql");

    expect(migration).toContain("security invoker");
    expect(migration).toContain("public.has_role(auth.uid(), 'organizer'::public.app_role)");
    expect(migration).toContain("raise exception 'Organizer access required'");
    expect(migration).toContain("revoke execute on function televoting.admin_rounds_page_overview(uuid) from public, anon, service_role");
    expect(migration).toContain("grant execute on function televoting.admin_rounds_page_overview(uuid) to authenticated");
  });
});
