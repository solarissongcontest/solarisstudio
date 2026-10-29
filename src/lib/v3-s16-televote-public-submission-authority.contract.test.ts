import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const hardening = read("supabase/migrations/20261027200500_v3_s16_televote_public_submission_authority.sql");
const submit = read("supabase/migrations/20260819150000_televoting_pre_submit_integrity.sql");
const server = read("src/integrations/televoting/vote.server.ts");

describe("S16 public Televote submission authority", () => {
  test("retains one governed ballot writer and removes the obsolete bypass", () => {
    expect(server).toContain('"submit_vote_checked"');
    expect(server).not.toContain('rpc("submit_vote"');
    expect(hardening).toContain("drop function if exists televoting.submit_vote(");
    expect(hardening).toContain("S16 canonical public Televote ballot writer");
  });

  test("keeps ballot acceptance inside the existing atomic preflight transaction", () => {
    expect(submit).toContain("if v_round.status<>'open'");
    expect(submit).toContain("for update;");
    expect(submit).toContain("if v_preflight.submitted_at is not null");
    expect(submit).toContain("insert into televoting.vote_submissions(");
    expect(submit).toContain("insert into televoting.vote_entries(");
    expect(submit).toContain("set submission_id=v_sub_id, submitted_at=now()");
  });

  test("pins SECURITY DEFINER namespace and exposes only the intended public actors", () => {
    expect(hardening).toContain("set search_path = pg_catalog, televoting, pg_temp");
    expect(hardening).toContain(") from public, service_role;");
    expect(hardening).toContain(") to anon, authenticated;");
  });

  test("preserves response-loss reconciliation instead of blind retry", () => {
    expect(server).toContain("submitTelevoteWithReconciliation(");
    expect(server).toContain("reconcileMergedTelevotingVoteServer");
    expect(server).toContain('"v3_reconcile_televote"');
  });

  test("registers the S16 hardening migration with S13", () => {
    expect(hardening).toContain("public.v3_register_migration_contract(");
    expect(hardening).toContain("20261027200500_v3_s16_televote_public_submission_authority");
    expect(hardening).toContain("'forward_fix_only'");
  });
});
