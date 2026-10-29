import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20261027211500_v3_s16_entry_confirmation_authority.sql");
const confirmationSync = read("src/integrations/confirmations/sync.functions.ts");
const authority = read("src/lib/v3-s16-mutation-authority.ts");

describe("S16 canonical Entry mutation authority", () => {
  test("removes Confirmation as a peer public.entries writer", () => {
    expect(confirmationSync).not.toMatch(/\.from\(["']entries["']\)[\s\S]{0,900}\.(?:insert|update|upsert|delete)\s*\(/);
    expect(confirmationSync).toContain('db.rpc("v3_sync_confirmation_entry"');
  });

  test("rejects Entry conflicts before participant compatibility writes", () => {
    const command = confirmationSync.indexOf('db.rpc("v3_sync_confirmation_entry"');
    const participantMutation = confirmationSync.indexOf('.from("participants")\n      .insert');
    expect(command).toBeGreaterThan(-1);
    expect(participantMutation).toBeGreaterThan(command);
  });

  test("derives Entry scope and content from the Confirmation submission identity", () => {
    expect(migration).toContain("create or replace function public.v3_sync_confirmation_entry(");
    expect(migration).toContain("p_submission_id uuid");
    expect(migration).toContain("from public.submissions submission");
    expect(migration).toContain("from public.internal_entries entry");
    expect(migration).toContain("from public.national_final_entries candidate");
    expect(migration).toContain("v_existing.source <> 'confirmations'");
    expect(migration).toContain("confirmation_submission_updated_at");
    expect(migration).toContain("coalesce(v_existing_source_updated_at, v_existing.updated_at) > v_submission.updated_at");
    expect(migration).toContain("'status', 'canonical_owned'");
    expect(migration).toContain("'status', 'canonical_newer'");
  });

  test("revokes raw Entry DML after caller cutover", () => {
    expect(migration).toContain("revoke insert, update, delete on table public.entries");
    expect(migration).toContain("from anon, authenticated, service_role;");
  });

  test("keeps the canonical command private to service-role orchestration", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public, private");
    expect(migration).toContain("revoke all on function public.v3_sync_confirmation_entry(uuid)");
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.v3_sync_confirmation_entry(uuid)");
    expect(migration).toContain("to service_role;");
  });

  test("registers S13 adoption and S16 canonical ownership", () => {
    expect(migration).toContain("20261027211500_v3_s16_entry_confirmation_authority");
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(authority).toContain('canonicalCommands: ["public.v3_sync_confirmation_entry"]');
  });
});
