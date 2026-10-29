import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20261027202500_v3_s16_televote_round_entry_authority.sql");
const server = read("src/integrations/televoting/entries.server.ts");
const functions = read("src/integrations/televoting/entries.functions.ts");

describe("S16 Televote round configuration authority", () => {
  test("removes direct application DML from round entries and rounds", () => {
    expect(server).not.toMatch(/\.from\(["'`]round_entries["'`]\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\s*\(/);
    expect(server).not.toMatch(/\.from\(["'`]rounds["'`]\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\s*\(/);
    expect(server).toContain('rpc("v3_configure_round"');
  });

  test("uses voting.manage, round lock, revision CAS and operation identity", () => {
    expect(migration).toContain("studio2_access_allowed('voting.manage'");
    expect(migration).toContain("for update;");
    expect(migration).toContain("p_expected_round_version");
    expect(migration).toContain("VERSION_CONFLICT");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("private.studio2_complete_operation(");
    expect(functions).toContain("expectedRoundVersion?: number");
    expect(server).toContain("p_expected_round_version: snapshot.version");
  });

  test("blocks configuration while voting is open and protects submitted ballot targets", () => {
    expect(migration).toContain("v_round.status = 'open'");
    expect(migration).toContain("ROUND_OPEN");
    expect(migration).toContain("ENTRY_REFERENCED_BY_BALLOT");
    expect(migration).toContain("submission.status <> 'deleted'");
  });

  test("validates complete reorder identity rather than trusting client order", () => {
    expect(migration).toContain("array_agg(id order by id)");
    expect(migration).toContain("array_length(v_existing_ids,1)");
    expect(migration).toContain("not (id = any(v_existing_ids))");
  });

  test("does not expose the mutation RPC to anonymous or service role callers", () => {
    expect(migration).toContain(") from public, anon, service_role;");
    expect(migration).toContain(") to authenticated;");
  });

  test("registers the high-risk migration with S13", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261027202500_v3_s16_televote_round_entry_authority");
    expect(migration).toContain("'forward_fix_only'");
  });
});
