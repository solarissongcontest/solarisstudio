import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const candidatePath = "docs/v3/recovery-candidates/forward-only-deterministic-http409.sql";
const candidate = read(candidatePath);
const canonical = read("supabase/migrations/20261018031000_v3_http409_deterministic_conflicts.sql");
const entryReview = read("supabase/migrations/20261018024500_v3_entry_review_conflict_http409.sql");

function parseAllowedSignatures(sql: string): string[] {
  const match = sql.match(/v_signatures constant text\[\] := array\[([\s\S]*?)\];/);
  expect(match, "Explicit reviewed allowlist must remain parseable").not.toBeNull();
  return Array.from(match![1].matchAll(/'([^']+)'/g), (capture) => capture[1]);
}

describe("V3 candidate: bounded forward-only deterministic HTTP409 repair", () => {
  it("preserves exactly the canonical 28 deterministic signatures plus Entry review", () => {
    const originalSignatures = parseAllowedSignatures(canonical);
    const repairSignatures = parseAllowedSignatures(candidate);
    expect(originalSignatures).toHaveLength(28);
    expect(repairSignatures).toEqual([
      "public.studio2_apply_confirmation_entry_review(text,uuid,text,text,uuid,text,bigint,uuid,uuid)",
      ...originalSignatures,
    ]);
    expect(new Set(repairSignatures).size).toBe(29);
    expect(entryReview).toContain("raise sqlstate 'PT409' using message = 'VERSION_CONFLICT'");
  });

  it("handles both unrepaired hosted state and already-repaired clean local state", () => {
    expect(candidate).toContain("v_function := to_regprocedure(v_signature)");
    expect(candidate).toContain("v_has_old := position('''40001''' in v_definition) > 0");
    expect(candidate).toContain("v_has_new := position('''PT409''' in v_definition) > 0");
    expect(candidate).toContain("if v_has_old = v_has_new then");
    expect(candidate).toContain("if v_has_old then");
    expect(candidate).toContain("replace(v_definition, '''40001''', '''PT409''')");
    expect(candidate).toContain("mixed/unknown SQLSTATE");
    expect(candidate).toContain("postcondition failed");
  });

  it("is atomic and refuses missing functions and privilege/security drift", () => {
    expect(candidate.trimStart()).toMatch(/^-- CANDIDATE ONLY/);
    expect(candidate).toMatch(/\bbegin;[\s\S]*\bcommit;\s*$/);
    expect(candidate).toContain("set local lock_timeout = '5s'");
    expect(candidate).toContain("set local statement_timeout = '120s'");
    expect(candidate).toContain("V3 conflict reconciliation blocked: missing function");
    expect(candidate).toContain("p.proowner is distinct from v_owner");
    expect(candidate).toContain("p.proacl is distinct from v_acl");
    expect(candidate).toContain("p.proconfig is distinct from v_config");
    expect(candidate).toContain("p.prosecdef is distinct from v_definer");
    expect(candidate).toContain("p.provolatile is distinct from v_volatility");
    expect(candidate).not.toMatch(/\b(?:truncate|drop\s+table|delete\s+from|insert\s+into)\b/i);
    expect(candidate).not.toContain("supabase_migrations.schema_migrations");
  });

  it("preserves genuine DomainEvent serialization errors and does not touch unrelated routines", () => {
    const signatures = parseAllowedSignatures(candidate);
    expect(signatures).not.toContain("public.studio2_complete_domain_event_delivery(uuid,text,text,jsonb)");
    expect(candidate).toContain("v3_assert_worker_retry");
    expect(candidate).toContain("studio2_complete_domain_event_delivery(uuid,text,text,jsonb)");
    expect(candidate).toContain("genuine DomainEvent lease retry semantics");
    expect(candidate).toContain("notify pgrst, 'reload schema'");
  });

  it("the LOCAL rehearsal script parses and cannot honor an inherited hosted PGHOSTADDR", () => {
    const scriptPath = resolve(
      process.cwd(),
      "scripts/rehearse-v3-http409-recovery-local.mjs",
    );
    expect(() =>
      execFileSync(process.execPath, ["--check", scriptPath], {
        encoding: "utf8",
        timeout: 10_000,
      }),
    ).not.toThrow();
    const harness = readFileSync(scriptPath, "utf8");
    expect(harness).toContain('PGHOST: "127.0.0.1"');
    expect(harness).toContain('PGHOSTADDR: "127.0.0.1"');
    expect(harness).toContain("delete pgEnv.PGSERVICE;");
    expect(harness).not.toContain('PGSERVICE: ""');
    expect(harness).toContain('"-h", "127.0.0.1"');
    expect(harness).toContain('SOLARIS_RUN_LOCAL_DB_REHEARSAL !== "YES"');
  });

  it("cannot silently become a tracked migration without a separate operator action", () => {
    expect(candidatePath).not.toMatch(/^supabase\/migrations\//);
    expect(candidate).toContain("NOT a tracked Supabase migration");
    expect(candidate).toContain("NEVER paste this into hosted SQL Editor");
  });
});
