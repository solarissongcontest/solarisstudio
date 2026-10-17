import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const migration = () =>
  source(
    "supabase/migrations/20261017212902_confirmation_round_response_integrity.sql",
  );

describe("Confirmation round response integrity", () => {
  it("prevents deleting a round from cascading into its responses", () => {
    const sql = migration().toLowerCase();

    expect(sql).toContain("foreign key (round_id)");
    expect(sql).toContain("references public.submission_rounds(id)");
    expect(sql).toContain("on delete restrict");
    expect(sql).not.toContain("on delete cascade");
  });

  it("keeps the guarded production deployer aligned after the live hotfix", () => {
    const deployer = source("scripts/v3-production-supabase-push.sh");

    expect(deployer).toContain('EXPECTED_REMOTE_HEAD="20261017212902"');
    expect(deployer).toContain('EXPECTED_REPO_HEAD="20261017212902"');
    expect(deployer).toContain('EXPECTED_PENDING_COUNT="0"');
    expect(deployer).toContain("if (( EXPECTED_PENDING_COUNT == 0 )); then");
    expect(deployer).toContain(
      "Production and repository migration heads are aligned; nothing to deploy.",
    );
  });
});
