import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hardening = readFileSync(
  "supabase/migrations/20261029151500_v3_s16_confirmation_derived_trigger_authority.sql",
  "utf8",
).toLowerCase();

const canonicalSubmit = readFileSync(
  "supabase/migrations/20261015183100_v3_confirmation_submit_runtime_replay_restore.sql",
  "utf8",
).toLowerCase();

describe("V3 S16 Confirmation derived-trigger authority", () => {
  it("replaces recovery-code trigger mutation with a private column default", () => {
    expect(hardening).toContain(
      "alter column recovery_code set default public.generate_recovery_code()",
    );
    expect(hardening).toContain(
      "drop trigger if exists ensure_submission_recovery_code_trg",
    );
    expect(hardening).toContain(
      "drop function if exists public.ensure_submission_recovery_code()",
    );
    expect(hardening).toContain(
      "revoke all on function public.generate_recovery_code()\n  from public, anon, authenticated, service_role",
    );
  });

  it("keeps canonical submission creation compatible with the recovery-code default", () => {
    const match = canonicalSubmit.match(
      /insert into public\.submissions\s*\(([\s\S]*?)\)\s*values\s*\(/,
    );

    expect(match?.[1]).toBeTruthy();
    expect(match?.[1]).not.toContain("recovery_code");
  });

  it("removes the redundant browser-registration trigger because canonical submit registers it transactionally", () => {
    expect(hardening).toContain(
      "drop trigger if exists register_submission_browser_trg",
    );
    expect(hardening).toContain(
      "drop function if exists public.register_submission_browser()",
    );

    expect(canonicalSubmit).toContain(
      "insert into public.submission_browser_sessions(submission_id, browser_session_id, last_used_at)",
    );
    expect(canonicalSubmit).toContain(
      "on conflict(submission_id, browser_session_id) do update",
    );
  });

  it("carries executable replay-time proof for attachment and privilege drift", () => {
    expect(hardening).toContain("from pg_trigger trigger_row");
    expect(hardening).toContain(
      "to_regprocedure('public.ensure_submission_recovery_code()') is not null",
    );
    expect(hardening).toContain(
      "to_regprocedure('public.register_submission_browser()') is not null",
    );
    expect(hardening).toContain(
      "has_function_privilege('service_role', 'public.generate_recovery_code()', 'execute')",
    );
  });
});
