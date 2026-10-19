import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019112300_v3_s14_transition_http409.sql",
  ),
  "utf8",
);
const runtimeRehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-edition-event-vocabulary-rehearsal.sh"),
  "utf8",
);

describe("System V3 S14 edition lifecycle transition normalization", () => {
  it("targets only the exact governed V3 lifecycle command", () => {
    expect(migration).toContain(
      "public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)",
    );
    expect(migration).toContain("to_regprocedure(v_signature)");
    expect(migration).toContain("pg_get_functiondef(v_function::oid)");
    expect(migration).not.toContain("from pg_proc");
    expect(migration).not.toContain("from pg_namespace");
  });

  it("normalizes deterministic 40001 conflicts to PostgREST PT409 and fails closed if the contract drifted", () => {
    expect(migration).toContain(
      "replace(v_definition, '''40001''', '''PT409''')",
    );
    expect(migration).toContain(
      "Expected deterministic SQLSTATE 40001 was not found",
    );
    expect(migration).toContain(
      "Deterministic SQLSTATE 40001 remains in V3 edition transition",
    );
    expect(migration).toContain(
      "HTTP 409 SQLSTATE was not installed in V3 edition transition",
    );
    expect(migration).toContain(
      "Canonical V3 edition transition function is missing",
    );
  });

  it("aligns only the canonical S4 lifecycle event with edition.transitioned", () => {
    expect(migration).toContain("v_old_domain_event");
    expect(migration).toContain("'edition.state_changed'");
    expect(migration).toContain("v_new_domain_event");
    expect(migration).toContain("'edition.transitioned'");
    expect(migration).toContain(
      "replace(v_rewritten, v_old_domain_event, v_new_domain_event)",
    );
    expect(migration).toContain(
      "Canonical edition.state_changed DomainEvent remains in V3 edition transition",
    );
    expect(migration).toContain(
      "Canonical edition.transitioned DomainEvent was not installed in V3 edition transition",
    );
    expect(migration).toContain("legacy contest-event audit vocabulary");
  });

  it("proves the normalized vocabulary against persisted runtime events", () => {
    expect(runtimeRehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(runtimeRehearsal).toContain("Refusing non-local database rehearsal");
    expect(runtimeRehearsal).toContain("bun run scripts/check-v3-production-isolation.ts");
    expect(runtimeRehearsal).toContain("event_type='edition.transitioned'");
    expect(runtimeRehearsal).toContain("event_type='edition.state_changed'");
    expect(runtimeRehearsal).toContain("type='edition.state_changed'");
    expect(runtimeRehearsal).toContain("CANONICAL_COUNT");
    expect(runtimeRehearsal).toContain("OLD_CANONICAL_COUNT");
    expect(runtimeRehearsal).toContain("LEGACY_COUNT");
    expect(runtimeRehearsal).not.toMatch(/supabase\.co/i);
  });

  it("preserves genuine DomainEvent worker lease retry semantics on 40001", () => {
    expect(migration).toContain(
      "public.studio2_process_edition_domain_event(uuid,text,text)",
    );
    expect(migration).toContain(
      "Edition DomainEvent lease conflict no longer retains genuine serialization retry semantics",
    );
    expect(migration).toContain("position('''40001''' in v_definition) = 0");
  });

  it("is explicitly classified by the S13 migration framework", () => {
    expect(migration).toContain("v3.s14.transition-http409");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false");
  });

  it("reloads PostgREST schema after replacing the function definition", () => {
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});
