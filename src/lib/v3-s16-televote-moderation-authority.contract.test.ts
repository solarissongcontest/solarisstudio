import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20261027193000_v3_s16_televote_moderation_authority.sql");
const server = read("src/integrations/televoting/moderation.server.ts");

describe("S16 Televote ballot moderation authority", () => {
  test("removes raw application writes to critical ballot tables", () => {
    expect(server).not.toMatch(/\.from\(["'`]vote_submissions["'`]\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(/);
    expect(server).not.toMatch(/\.from\(["'`]vote_entries["'`]\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(/);
    expect(server).toContain('rpc("v3_moderate_submission"');
  });

  test("uses edition-scoped capability, operation identity and revision CAS", () => {
    expect(migration).toContain("studio2_access_allowed('voting.manage'");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("VERSION_CONFLICT");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).toContain("studio2_televote_submission_versions");
  });

  test("replaces ballot entries inside the same database transaction", () => {
    expect(migration).toContain("delete from televoting.vote_entries");
    expect(migration).toContain("insert into televoting.vote_entries");
    expect(migration).toContain("update televoting.vote_submissions");
    expect(migration).toContain("insert into televoting.admin_audit_log");
    expect(migration).toContain("jsonb_array_length(v_payload -> 'entries') not between 5 and 20");
    expect(migration).toContain("v_total <> 20");
    expect(migration).toContain("eligible.round_id = v_submission.round_id");
  });

  test("keeps moderation command unavailable to anonymous and service role callers", () => {
    expect(migration).toContain(
      ") from public, anon, service_role;\ngrant execute on function televoting.v3_moderate_submission(",
    );
    expect(migration).toContain(") to authenticated;");
  });

  test("registers the high-risk migration with S13", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("v3.televote.moderation-authority");
    expect(migration).toContain("'forward_fix_only'");
  });
});
