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

describe("country auth protection during restricted platform modes", () => {
  it("allows only the exact country-auth limiter through the operational gate", () => {
    expect(gateMigration).toContain(
      "if v_rpc_name = 'country_auth_consume_rate_limit' then",
    );
    expect(gateMigration).toContain(
      "if position('/rpc/' in v_path) > 0 then",
    );
    expect(gateMigration).toContain("studio2_apply_confirmation_round_change");
    expect(gateMigration).toContain("studio2_apply_platform_mode_change");
    expect(gateMigration).not.toContain("if current_user = 'service_role'");
    expect(gateMigration).not.toContain("if session_user = 'service_role'");
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

  it("rehearses sign-in, recovery and global fail-closed behavior in read_only", () => {
    expect(recoveryRehearsal).toContain('stage "enter-read-only"');
    expect(recoveryRehearsal).toContain("set mode = 'read_only'");
    expect(recoveryRehearsal).toContain('stage "read-only-rate-limit-rpc"');
    expect(recoveryRehearsal).toContain('stage "read-only-signin"');
    expect(recoveryRehearsal).toContain('stage "read-only-global-gate"');
    expect(recoveryRehearsal).toContain('stage "recovery-protection-failure"');
    expect(recoveryRehearsal).toContain('stage "recovery-rate-limit-exhaustion"');
    expect(recoveryRehearsal).toContain("country_auth_consume_rate_limit");
    expect(recoveryRehearsal).toContain("v3_revoke_session");
    expect(recoveryRehearsal).toContain("Password recovery is temporarily unavailable. Try again shortly.");
    expect(recoveryRehearsal).toContain("Mailpit did not capture the recovery email");
    expect(recoveryRehearsal).toContain("old password still signed in after reset");
  });
});
