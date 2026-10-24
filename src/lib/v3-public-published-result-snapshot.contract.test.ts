import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = () =>
  source("supabase/migrations/20261020064712_v3_public_published_result_snapshot.sql");
const rehearsal = () => source("scripts/rehearse-v3-public-result-snapshot.sh");

describe("System V3 public published result snapshot", () => {
  it("registers through the S13 migration contract", () => {
    const sql = migration();

    expect(sql).toContain("public.v3_register_migration_contract(");
    expect(sql).toContain("20261020064712_v3_public_published_result_snapshot");
    expect(sql).toContain("'forward_fix_only'");
  });

  it("binds public reads to canonical Publication and the exact immutable result version", () => {
    const sql = migration();

    expect(sql).toContain("public.studio2_show_publication_controls control");
    expect(sql).toContain("join private.v3_result_versions version");
    expect(sql).toContain("version.version = control.source_result_version");
    expect(sql).toContain("control.state = 'public'");
    expect(sql).toContain("control.source_result_version is not null");
    expect(sql).toContain("show.published = true");
    expect(sql).toContain("edition.published = true");
    expect(sql).toContain("private.v3_publication_result_version_release_ready(");
    expect(sql).not.toContain("from public.results");
  });

  it("returns durable identity keys and explicit publication/version identity", () => {
    const sql = migration();

    expect(sql).toContain("'resultVersion', flags.source_result_version");
    expect(sql).toContain("'publicationVersion', flags.publication_version");
    expect(sql).toContain("'countryId', row_value -> 'countryId'");
    expect(sql).toContain("'contestEntityId', row_value -> 'contestEntityId'");
    expect(sql).toContain("'finalRank', row_value -> 'finalRank'");
    expect(sql).toContain("'totalPoints', row_value -> 'totalPoints'");
  });

  it("does not leak unpublished jury, televote or detailed-voting layers", () => {
    const sql = migration();

    expect(sql).toContain("when flags.jury_public");
    expect(sql).toContain("jsonb_build_object('juryPoints'");
    expect(sql).toContain("when flags.televote_public");
    expect(sql).toContain("jsonb_build_object('televotePoints'");
    expect(sql).toContain("when flags.detailed_voting_public");
    expect(sql).toContain("jsonb_build_object('televoteComponents'");
    expect(sql).toContain("'jury', flags.jury_public");
    expect(sql).toContain("'televote', flags.televote_public");
  });

  it("is callable by public browser roles without granting private version-table access", () => {
    const sql = migration();

    expect(sql).toContain(
      "revoke all on function public.v3_public_published_result_snapshot(uuid)",
    );
    expect(sql).toContain("to anon, authenticated, service_role");
    expect(sql).not.toContain("grant select on table private.v3_result_versions");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
  });

  it("has a local-only rehearsal for immutable publication, hiding and correction", () => {
    const script = rehearsal();

    expect(script).toContain('case "$API_URL" in http://127.0.0.1:*|http://localhost:*');
    expect(script).toContain("Refusing hosted Supabase rehearsal");
    expect(script).toContain("set local role anon");
    expect(script).toContain("private show exposed a result snapshot");
    expect(script).toContain("mutable result row changed published version 1");
    expect(script).toContain("hidden publication still exposed a snapshot");
    expect(script).toContain("published correction did not switch to version 2");
    expect(script).toContain("unpublished televote split leaked from version 2");
    expect(script).not.toContain(".supabase.co");
  });
});
