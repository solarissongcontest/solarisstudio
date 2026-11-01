import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const gateMigration = source(
  "supabase/migrations/20261101002000_country_auth_readonly_rate_limit_gate.sql",
);
const limiterMigration = source(
  "supabase/migrations/20261004224000_country_auth_rate_limits.sql",
);
const authFunction = source("supabase/functions/country-auth/index.ts");
const recoveryRehearsal = source(".github/scripts/v3-password-recovery-rehearsal.sh");
const readonlyWrapper = source(
  ".github/scripts/v3-password-recovery-readonly-rehearsal.sh",
);
const readonlyGateChecks = source(
  ".github/scripts/v3-country-auth-readonly-gate-checks.sh",
);

describe("country auth protection during restricted platform modes", () => {
  it("allows only the exact country-auth limiter through the operational gate", () => {
    expect(gateMigration).toContain(
      "if v_rpc_name = 'country_auth_consume_rate_limit' then",
    );
    expect(gateMigration).toContain(
      "if position(''/rpc/'' in v_path) > 0 then",
    );
    expect(gateMigration).toContain("studio2_apply_confirmation_round_change");
    expect(gateMigration).toContain("studio2_apply_platform_mode_change");
    expect(gateMigration).not.toContain("if current_user = 'service_role'");
    expect(gateMigration).not.toContain("if session_user = 'service_role'");
  });

  it("keeps canonical S13 registration when available without blocking pre-S13 production", () => {
    expect(gateMigration).toContain(
      "to_regprocedure(\n       'public.v3_register_migration_contract(text,integer,text,boolean,text,text)'",
    );
    expect(gateMigration).toContain("execute $registration$");
    expect(gateMigration).toContain(
      "select public.v3_register_migration_contract(",
    );
    expect(gateMigration).toContain(
      "only executing it when that framework exists",
    );
  });

  it("preserves the private hashed limiter and service-role-only execution", () => {
    expect(limiterMigration).toContain("private.country_auth_rate_limits");
    expect(limiterMigration).toContain("p_key_hash text");
    expect(limiterMigration).toContain(
      "revoke all on private.country_auth_rate_limits from public, anon, authenticated",
    );
    expect(limiterMigration).toContain(
      "revoke all on function public.country_auth_consume_rate_limit(text, text, integer, integer)",
    );
    expect(limiterMigration).toContain("from public, anon, authenticated");
    expect(limiterMigration).toContain("to service_role");
    expect(gateMigration).toContain("has_function_privilege(\n    'service_role'");
    expect(gateMigration).toContain("has_function_privilege(\n       'anon'");
    expect(gateMigration).toContain("has_function_privilege(\n       'authenticated'");
  });

  it("fails recovery honestly when abuse protection infrastructure is unavailable", () => {
    expect(authFunction).toContain(
      'console.error("[country-auth] Recovery rate limiting unavailable", error)',
    );
    expect(authFunction).toContain(
      'return json({ error: "Password recovery is temporarily unavailable. Try again shortly." }, 503);',
    );
    expect(authFunction).toContain(
      "return json({ ok: true, recoveryAvailable: true }, 202);",
    );
  });

  it("runs the canonical recovery rehearsal under read_only after fixtures exist", () => {
    expect(readonlyWrapper).toContain("v3-country-auth-readonly-gate-checks.sh");
    expect(readonlyWrapper).toContain("v3-password-recovery-rehearsal.sh");
    expect(readonlyWrapper).toContain("set mode = 'normal'");
    expect(readonlyWrapper).toContain("RECOVERY_PLATFORM_MODE=read_only");
    expect(recoveryRehearsal).toContain('stage "country-account-enrich"');
    expect(recoveryRehearsal).toContain('stage "platform-mode"');
    expect(recoveryRehearsal).toContain("set mode = :'recovery_mode'");
    expect(recoveryRehearsal.indexOf('stage "platform-mode"')).toBeGreaterThan(
      recoveryRehearsal.indexOf('stage "country-account-enrich"'),
    );
    expect(recoveryRehearsal.indexOf('stage "recovery-classification"')).toBeGreaterThan(
      recoveryRehearsal.indexOf('stage "platform-mode"'),
    );
    expect(recoveryRehearsal).toContain("Mailpit did not capture the recovery email");
    expect(recoveryRehearsal).toContain("valid recovery link did not return to local /auth/reset");
    expect(recoveryRehearsal).toContain("new-password sign-in returned HTTP");
    expect(recoveryRehearsal).toContain("old password still signed in after reset");
  });

  it("proves sign-in protection, recovery failure semantics and global fail-closed behavior", () => {
    expect(readonlyGateChecks).toContain("country_auth_consume_rate_limit");
    expect(readonlyGateChecks).toContain("anon directly executed the limiter");
    expect(readonlyGateChecks).toContain("authenticated caller directly executed the limiter");
    expect(readonlyGateChecks).toContain("valid country sign-in reaches password authentication in read_only");
    expect(readonlyGateChecks).toContain("sign-in rate limiting remains enforced");
    expect(readonlyGateChecks).toContain("unrelated service-role table write");
    expect(readonlyGateChecks).toContain("v3_revoke_session");
    expect(readonlyGateChecks).toContain("exhausted recovery budget preserves generic anti-enumeration envelope");
    expect(readonlyGateChecks).toContain("Password recovery is temporarily unavailable. Try again shortly.");
    expect(readonlyGateChecks).toContain("limiter infrastructure failure is generic 503, not fake success");
  });
});