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
    expect(route).toContain("rollout.data?.enabled === true");
    expect(route).toContain("rollout.data.meEnabled === true");
    expect(route).toContain("viewerId={rollout.data.userId}");
    expect(route).toContain("!country &&");
    expect(route).toContain('return <MySolarisCountryModule section="history" />');
  });

  it("composes current and historical memberships without the legacy archive/editor graph", () => {
    const screen = read("src/components/v3/V3DelegationHistoryScreen.tsx");
    const history = read("src/lib/hod-self-history.ts");

    expect(screen).toContain("useOwnedHodHistory");
    expect(screen).toContain("useOwnedHodClaims");
    expect(screen).toContain("workspace.user?.id === viewerId");
    expect(screen).toContain("workspace.countryAccount?.access.userId === viewerId");
    expect(screen).toContain("currentHistory.data?.country_id === activeCountryId");
    expect(screen).toContain("claim.country_id");
    expect(screen).toContain("claim.edition_id");
    expect(screen).toContain("countryById.get(item.countryId)");
    expect(history).toContain('["owned-hod-edition-history", viewerId ?? "current-viewer"]');
    expect(history).toContain('["owned-hod-edition-claims", viewerId ?? "no-viewer"]');
    expect(history).toContain('supabase.rpc("owned_hod_edition_history")');
    expect(history).toContain('.from("country_hod_edition_claims")');
    expect(history).toContain('.eq("user_id", viewerId!)');
    expect(screen).not.toContain("useAllParticipants");
    expect(screen).not.toContain("useAllContestEntities");
    expect(screen).not.toContain("useSaveCountryEntry");
    expect(screen).not.toContain("MySolarisCountryModule");
  });

  it("proves the existing history sources are caller-owned and RLS-bound", () => {
    const finalHistoryMigration = read("supabase/migrations/20260822001000_finalize_hod_release_hardening.sql");
    const claimsSchemaMigration = read("supabase/migrations/20260821234500_country_hod_self_history.sql");
    const currentClaimsRls = read("supabase/migrations/20260915182035_permission_engine_v2_delegation_confirmation_rls.sql");
    const client = read("src/lib/hod-self-history.ts");

    expect(finalHistoryMigration).toContain("create or replace function public.owned_hod_edition_history()");
    expect(finalHistoryMigration).toContain("v_user uuid := auth.uid()");
    expect(finalHistoryMigration).toContain("where user_id=v_user and status='active'");
    expect(finalHistoryMigration).toContain("where p.country_id=v_country and p.participation_status='confirmed'");
    expect(finalHistoryMigration).toContain("revoke all on function public.owned_hod_edition_history() from public, anon");
    expect(finalHistoryMigration).toContain("grant execute on function public.owned_hod_edition_history() to authenticated");

    expect(claimsSchemaMigration).toContain("primary key (user_id, country_id, edition_id)");
    expect(currentClaimsRls).toContain('create policy "country hod claims self or capability read"');
    expect(currentClaimsRls).toContain("user_id = (select auth.uid())");
    expect(currentClaimsRls).toContain("studio2_access_allowed('delegation.read', edition_id, false)");
    // Organizer/delegation capability may widen the table policy, so the Me
    // consumer independently restricts the projection back to its viewer.
    expect(client).toContain('.eq("user_id", viewerId!)');
    expect(client).toContain("row.user_id === viewerId");
  });

  it("shows past countries, editions and roles with canonical archive identity", () => {
    const screen = read("src/components/v3/V3DelegationHistoryScreen.tsx");

    expect(screen).toContain('status === "mine"');
    expect(screen).toContain('return "You were HOD"');
    expect(screen).toContain("country?.name");
    expect(screen).toContain("editionById.get(item.editionId)");
    expect(screen).toContain("edition?.slug");
    expect(screen).toContain("`/editions/${edition.slug}`");
    expect(screen).toContain("Past editions, delegations and HOD roles");
    expect(screen).not.toContain("slugify(");
    expect(screen).not.toContain("item.editionName.toLowerCase");
  });

  it("keeps organizer country overrides out of caller-private V3 history", () => {
    const route = read("src/routes/_authenticated/my-solaris/history.tsx");
    const history = read("src/lib/hod-self-history.ts");

    expect(route).toContain("platformResolved && isAppMode && !country");
    expect(route).toContain("!country &&");
    expect(route).toContain("explicit Organizer country override");
    expect(history).toContain("The explicit user filter");
    expect(history).toContain('.eq("user_id", viewerId!)');
  });
});
