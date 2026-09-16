import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_friend_voting_read_cutover.sql"),
);
if (!migrationName) throw new Error("friend-voting read cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("friend-voting read Permission Engine cutover", () => {
  it("rewrites only the canonical legacy authorization clause", () => {
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain("v_after := replace(v_before, v_legacy, v_replacement)");
    expect(migration).toContain("friend-voting authorization source clause drifted; refusing cutover");
    expect(migration).toContain("friend-voting authorization rewrite made no change");
  });

  it("moves non-service access to edition/global non-strict voting.read", () => {
    expect(migration).toContain(
      "public.studio2_access_allowed(\\'voting.read\\', p_edition_id, false)",
    );
    expect(migration).toContain("coalesce(auth.role(), \\'\\') <> \\'service_role\\'");
  });

  it("verifies the resulting database body has no legacy role gate", () => {
    expect(migration).toContain("v_after ilike '%public.has_role(%'");
    expect(migration).toContain(
      "v_after not ilike '%public.studio2_access_allowed(''voting.read'', p_edition_id, false)%'",
    );
  });

  it("targets only the expected overload", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "pg_get_function_identity_arguments(p.oid) = 'p_channel text, p_edition_id uuid, p_limit integer'",
    );
    expect(sql).toContain("p.proname = 'friend_voting_historical_country_payload'");
  });

  it("preserves authenticated/service execution and revokes public/anonymous execution", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "revoke all on function public.friend_voting_historical_country_payload(text, uuid, integer) from public, anon;",
    );
    expect(sql).toContain(
      "grant execute on function public.friend_voting_historical_country_payload(text, uuid, integer) to authenticated, service_role;",
    );
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
