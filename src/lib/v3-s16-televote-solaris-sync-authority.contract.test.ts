import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20261027204000_v3_s16_televote_solaris_sync_authority.sql");
const server = read("src/integrations/televoting/solaris-sync.server.ts");

describe("S16 Televote Solaris lineup sync authority", () => {
  test("keeps source inspection read-only", () => {
    const readStart = server.indexOf("async function resolveRoundSource");
    const mutationStart = server.indexOf("export async function syncMergedRoundFromSolarisServer");
    const readPath = server.slice(readStart, mutationStart);
    expect(readPath).not.toContain("ensureCanonicalTelevotingEditionsServer()");
    expect(readPath).not.toMatch(/\.(?:insert|update|upsert|delete)\s*\(/);
  });

  test("removes raw round-entry and binding writes from the sync path", () => {
    const mutationStart = server.indexOf("export async function syncMergedRoundFromSolarisServer");
    const syncPath = server.slice(mutationStart);
    expect(syncPath).not.toContain('.from("round_entries").update');
    expect(syncPath).not.toContain('.from("televoting_round_bindings").upsert');
    expect(syncPath).not.toContain('.from("integration_events").insert');
    expect(syncPath).toContain('rpc("v3_sync_round_lineup"');
  });

  test("atomically owns lineup, source fields, audit and integration evidence", () => {
    expect(migration).toContain("delete from televoting.round_entries");
    expect(migration).toContain("insert into televoting.round_entries");
    expect(migration).toContain("insert into public.televoting_round_bindings");
    expect(migration).toContain("insert into public.integration_events");
    expect(migration).toContain("insert into televoting.admin_audit_log");
    expect(migration).toContain("private.studio2_complete_operation");
  });

  test("does not cross the frozen Results binding boundary", () => {
    expect(migration).toContain("Deliberately do not update frozen_at");
    expect(migration).not.toMatch(/do update[\s\S]{0,500}frozen_at\s*=/i);
    expect(server).not.toContain("results-sync.server");
  });

  test("enforces edition scope, round CAS and open-round denial", () => {
    expect(migration).toContain("studio2_access_allowed('voting.manage'");
    expect(migration).toContain("p_expected_round_version");
    expect(migration).toContain("VERSION_CONFLICT");
    expect(migration).toContain("ROUND_OPEN");
    expect(migration).toContain("show_row.edition_id = v_solaris_edition_id");
  });

  test("registers migration adoption and restricts execution", () => {
    expect(migration).toContain("v3.televote.solaris-sync-authority");
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain(") from public, anon, service_role;");
    expect(migration).toContain(") to authenticated;");
  });
});
