import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const intelligence = source("src/integrations/televoting/intelligence.server.ts");
const migration = source("supabase/migrations/20260822001000_finalize_hod_release_hardening.sql");

describe("final public-release HOD hardening", () => {
  it("never creates anonymous person identities in the HOD analysis lens", () => {
    expect(intelligence.split('if (lens === "hod" && !hod) continue;').length - 1).toBe(2);
    expect(intelligence).not.toContain("`unknown:${editionId}:${voterCode}`");
    expect(intelligence).not.toContain("`unknown:${first.edition_id}:${voterCode}`");
  });

  it("keeps automatic HOD carry-forward scoped to canonical confirmed participations", () => {
    expect(migration).toContain("new.show_id is not null");
    expect(migration).toContain("new.participation_status <> 'confirmed'");
    expect(migration).toContain("v_existing.person_id <> v_person");
  });

  it("preserves organizer-verified HOD history and blocks anonymous RPC access", () => {
    expect(migration).toContain("v_existing.source not in ('country-account-self','country-account-auto')");
    expect(migration).toContain("revoke all on function public.owned_hod_edition_history() from public, anon");
    expect(migration).toContain("revoke all on function public.set_owned_hod_edition_status(uuid,text) from public, anon");
  });
});
