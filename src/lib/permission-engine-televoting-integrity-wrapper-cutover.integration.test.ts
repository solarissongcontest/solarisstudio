import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_televoting_integrity_wrapper_cutover.sql"),
);
if (!migrationName) throw new Error("televoting integrity wrapper cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function block(qualifiedName: string) {
  const marker = `create or replace function ${qualifiedName}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("televoting integrity wrapper Permission Engine cutover", () => {
  it("maps decisions, sanctions, and ballot exclusions to their least-privilege capabilities", () => {
    const decision = block("televoting.organizer_record_integrity_decision");
    const exclusion = block("televoting.organizer_exclude_integrity_ballot");
    const createSanction = block("televoting.organizer_create_integrity_sanction");
    const revokeSanction = block("televoting.organizer_revoke_integrity_sanction");

    expect(decision).toContain("public.studio2_access_allowed('integrity.manage', v_edition_id, false)");
    expect(exclusion).toContain(
      "public.studio2_access_allowed('televote.ballots.manage', v_edition_id, false)",
    );
    expect(createSanction).toContain(
      "public.studio2_access_allowed('integrity.sanction', v_edition_id, false)",
    );
    expect(revokeSanction).toContain(
      "public.studio2_access_allowed('integrity.sanction', v_edition_id, false)",
    );
    expect(migration).not.toContain("has_role");
  });

  it("keeps the existing signed-in requirement even though service-role EXECUTE stays granted", () => {
    for (const name of [
      "televoting.organizer_record_integrity_decision",
      "televoting.organizer_exclude_integrity_ballot",
      "televoting.organizer_create_integrity_sanction",
      "televoting.organizer_revoke_integrity_sanction",
    ]) {
      expect(block(name)).toContain("if auth.uid() is null then");
      expect(block(name)).toContain("raise exception 'Organizer access required' using errcode = '42501';");
    }
  });

  it("resolves the canonical Solaris edition without changing underlying not-found validation order", () => {
    const sql = normalized(migration);
    expect(sql).toContain("select coalesce(vpc.canonical_edition_id, il.solaris_id) into v_edition_id");
    expect(sql).toContain("left join televoting.rounds r on r.id = vpc.round_id");
    expect(sql).toContain("left join public.integration_links il on il.service = 'televoting' and il.entity_type = 'edition' and il.remote_id = r.edition_id::text");
    expect(sql).toContain("from televoting.voter_sanctions s join televoting.vote_preflight_checks vpc on vpc.id = s.preflight_id");
    expect(migration).not.toContain("raise exception 'Integrity declaration not found'");
    expect(migration).not.toContain("raise exception 'Sanction not found'");
  });

  it("preserves delegation to the governed integrity implementations", () => {
    expect(migration).toContain("return televoting.record_integrity_decision(");
    expect(migration).toContain("return televoting.exclude_integrity_ballot(p_preflight_id, p_reason, auth.uid());");
    expect(migration).toContain("return televoting.create_integrity_sanction(");
    expect(migration).toContain("return televoting.revoke_integrity_sanction(p_sanction_id, p_reason, auth.uid());");
  });

  it("keeps all four wrappers auth/service executable and anonymous closed", () => {
    const sql = normalized(migration);
    expect(sql).toContain("revoke all on function televoting.organizer_record_integrity_decision(uuid, text, text, text) from public, anon;");
    expect(sql).toContain("grant execute on function televoting.organizer_record_integrity_decision(uuid, text, text, text) to authenticated, service_role;");
    expect(sql).toContain("revoke all on function televoting.organizer_exclude_integrity_ballot(uuid, text) from public, anon;");
    expect(sql).toContain("grant execute on function televoting.organizer_exclude_integrity_ballot(uuid, text) to authenticated, service_role;");
    expect(sql).toContain("revoke all on function televoting.organizer_create_integrity_sanction(uuid, text, timestamptz, text) from public, anon;");
    expect(sql).toContain("grant execute on function televoting.organizer_create_integrity_sanction(uuid, text, timestamptz, text) to authenticated, service_role;");
    expect(sql).toContain("revoke all on function televoting.organizer_revoke_integrity_sanction(uuid, text) from public, anon;");
    expect(sql).toContain("grant execute on function televoting.organizer_revoke_integrity_sanction(uuid, text) to authenticated, service_role;");
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
