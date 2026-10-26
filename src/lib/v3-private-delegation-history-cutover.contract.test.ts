import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 private delegation-history cutover", () => {
  it("routes installed-app Me history to the caller-scoped V3 surface", () => {
    const route = read("src/routes/_authenticated/my-solaris/history.tsx");

    expect(route).toContain("V3DelegationHistoryScreen");
    expect(route).toContain("MySolarisProvider");
    expect(route).toContain("editionId={rollout.data.editionId}");
    expect(route).toContain("useV3RolloutProbe");
    expect(route).toContain("rollout.data?.meEnabled === true");
    expect(route).toContain("viewerId={rollout.data.userId}");
    expect(route).toContain("!country &&");
    expect(route).toContain('return <MySolarisCountryModule section="history" />');
  });

  it("uses the existing caller-owned HOD history instead of the legacy archive/editor graph", () => {
    const screen = read("src/components/v3/V3DelegationHistoryScreen.tsx");
    const history = read("src/lib/hod-self-history.ts");

    expect(screen).toContain("useOwnedHodHistory");
    expect(screen).toContain("useOwnedHodHistory(ownsIdentity && Boolean(countryId), viewerId)");
    expect(screen).toContain("workspace.user?.id === viewerId");
    expect(screen).toContain("workspace.countryAccount?.access.userId === viewerId");
    expect(screen).toContain("historyData?.country_id === countryId");
    expect(history).toContain('["owned-hod-edition-history", viewerId ?? "current-viewer"]');
    expect(history).toContain('supabase.rpc("owned_hod_edition_history")');
    expect(screen).not.toContain("useAllParticipants");
    expect(screen).not.toContain("useAllContestEntities");
    expect(screen).not.toContain("useSaveCountryEntry");
    expect(screen).not.toContain("MySolarisCountryModule");
  });

  it("proves the existing history RPC is caller-owned confirmed participation", () => {
    const migration = read("supabase/migrations/20260822001000_finalize_hod_release_hardening.sql");

    expect(migration).toContain("create or replace function public.owned_hod_edition_history()");
    expect(migration).toContain("v_user uuid := auth.uid()");
    expect(migration).toContain("where user_id=v_user and status='active'");
    expect(migration).toContain("where p.country_id=v_country and p.participation_status='confirmed'");
    expect(migration).toContain("revoke all on function public.owned_hod_edition_history() from public, anon");
    expect(migration).toContain("grant execute on function public.owned_hod_edition_history() to authenticated");
  });

  it("shows historical membership status and preserves canonical archive identity", () => {
    const screen = read("src/components/v3/V3DelegationHistoryScreen.tsx");

    expect(screen).toContain('status === "mine"');
    expect(screen).toContain('return "You were HOD"');
    expect(screen).toContain("editionById.get(item.edition_id)");
    expect(screen).toContain("edition?.slug");
    expect(screen).toContain("`/editions/${edition.slug}`");
    expect(screen).not.toContain("slugify(");
    expect(screen).not.toContain("item.edition_name.toLowerCase");
  });

  it("keeps organizer country overrides out of caller-private V3 history", () => {
    const route = read("src/routes/_authenticated/my-solaris/history.tsx");

    expect(route).toContain("platformResolved && isAppMode && !country");
    expect(route).toContain("!country &&");
    expect(route).toContain("explicit Organizer country override");
  });
});
