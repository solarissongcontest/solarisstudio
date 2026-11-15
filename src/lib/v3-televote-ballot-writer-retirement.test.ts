import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { V3_S16_CRITICAL_DOMAINS } from "./v3-s16-mutation-authority";

const migration = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261115000100_v3_televote_ballot_writer_retirement.sql"), "utf8");

describe("S16 public Televote ballot canonical source and legacy retirement", () => {
  it("exposes the preflight checked ballot as the governed public writer", () => {
    const domain = V3_S16_CRITICAL_DOMAINS.find(d => d.id === "televote");
    expect(domain?.canonicalCommands).toContain("televoting.submit_vote_checked");
    expect(domain?.canonicalCommands).toContain("public.v3_reconcile_published_televote");
  });
  it("fails closed on partial/unknown installations rather than silently adopting a missing old writer", () => {
    expect(migration).toContain("S16 ballot retirement requires both reviewed writer signatures");
    expect(migration).toContain("postgres-owned SECURITY DEFINER functions");
    expect(migration).toContain("drop function televoting.submit_vote(");
    expect(migration).not.toContain("drop function if exists televoting.submit_vote");
  });
  it("retains the one-shot public ballot path and revokes the service-role entry", () => {
    expect(migration).toContain("set search_path = pg_catalog, televoting, pg_temp");
    expect(migration).toContain("from public, service_role");
    expect(migration).toContain("to anon, authenticated");
    expect(migration).toContain("v3.televote.public-ballot-writer-retirement");
  });
  it("reconstructs omitted old Televote body only in local fixture and refuses hosted targets", () => {
    const generator = "scripts/stage-v3-televote-legacy-ballot-local-fixture.mjs";
    const safe = execFileSync(process.execPath, [generator], {
      cwd: process.cwd(),
      env: { ...process.env, SOLARIS_S02_TARGET: "local" },
      encoding: "utf8",
    });
    expect(safe).toContain("LOCAL-ONLY historical-source donor");
    expect(safe).toContain("create or replace function televoting.submit_vote(");
    expect(safe).toContain("insert into televoting.vote_submissions(");
    expect(safe).toContain("S16 legacy ballot fixture refuses to overwrite a present RPC");
    expect(safe).toContain("commit;");
    expect(safe).not.toContain("drop function televoting.submit_vote");
    expect(() => execFileSync(process.execPath, [generator], {
      cwd: process.cwd(),
      env: { ...process.env, SOLARIS_S02_TARGET: "production" },
      stdio: "pipe",
    })).toThrow();
  });
  it("adopts the existing System-owned retirement in ordered recovered-state installation and isolated restore", () => {
    const driver = readFileSync(resolve(process.cwd(),
      ".github/scripts/v3-observed-owner-recovery-local.sh"), "utf8");
    const s08 = driver.indexOf("operator_apply docs/v3/recovery-candidates/s08-televote-single-writer-local.sql");
    const retirement = driver.indexOf("operator_apply supabase/migrations/20261115000100_v3_televote_ballot_writer_retirement.sql");
    const resultsCas = driver.indexOf("source .github/scripts/v3-results-operation-recovery-local.sh");
    expect(s08).toBeGreaterThan(0);
    expect(retirement).toBeGreaterThan(s08);
    expect(resultsCas).toBeGreaterThan(retirement);
    expect(driver).toContain("s16_ballot_drift");
    expect(driver).toContain("S16 legacy ballot drift failure modified schema/data");
    expect(driver).toContain("operator_sql -f - < .github/tests/v3-televote-ballot-authority.sql");
    expect(driver).toContain("restored_sql -f - < .github/tests/v3-televote-ballot-authority.sql");
    expect(driver).toContain("'supabase/migrations/20261115000100_v3_televote_ballot_writer_retirement.sql'");
    expect(driver).toContain("s16LegacyTelevoteWriterRetired:true");
    expect(driver).toContain("s16CheckedVotePreflightApiRoleVerified:true");
    expect(driver).toContain("s16FullCriticalWriterCertified:false");
  });
  it("allows the S16 source scanner to recognize schema-qualified televoting commands", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/v3-s16-mutation-authority.ts"), "utf8");
    expect(source).toContain(String.raw`(?:public\\.|private\\.|televoting\\.)?`);
  });
});
