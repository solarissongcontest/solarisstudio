import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const gateMigration = source(
  "supabase/migrations/20261101000500_country_auth_rate_limit_read_only_gate.sql",
);
const limiterMigration = source(
  "supabase/migrations/20261004224000_country_auth_rate_limits.sql",
);
const authFunction = source("supabase/functions/country-auth/index.ts");
const gateRehearsal = source(
  ".github/scripts/v3-country-auth-read-only-gate-rehearsal.sh",
);
const signinRehearsal = source(
  ".github/scripts/v3-country-auth-read-only-signin-rehearsal.sh",
);
const protectionFailureRehearsal = source(
  ".github/scripts/v3-password-recovery-protection-failure-rehearsal.sh",
);
const readOnlyRecoveryRehearsal = source(
  ".github/scripts/v3-password-recovery-read-only-rehearsal.sh",
);
const fullRecoveryRehearsal = source(
  ".github/scripts/v3-password-recovery-rehearsal.sh",
);
const workflow = source(
  ".github/workflows/v3-account-session-management-rehearsal.yml",
);

describe("country authentication during read-only maintenance", () => {
  it("opens only the exact service-role rate-limit RPC through the operational gate", () => {
    expect(gateMigration).toContain(
      "if v_rpc_name = 'country_auth_consume_rate_limit' then",
    );
    expect(gateMigration).toContain("return;");
    expect(gateMigration).toContain(
      "revoke all on function public.country_auth_consume_rate_limit",
    );
    expect(gateMigration).toContain("from public, anon, authenticated");
    expect(gateMigration).toContain("to service_role");
    expect(gateMigration).not.toContain("studio2_request_is_service_role");
    expect(gateMigration).not.toContain("v_rpc_name like");
    expect(gateMigration).not.toContain("grant execute on all functions");

    expect(limiterMigration).toContain("private.country_auth_rate_limits");
    expect(limiterMigration).toContain("security definer");
    expect(limiterMigration).toContain("sha").toBe(false);
  });

  it("keeps the limiter private and stores only caller-supplied hashed keys", () => {
    expect(limiterMigration).toContain(
      "revoke all on private.country_auth_rate_limits from public, anon, authenticated",
    );
    expect(limiterMigration).toContain("p_key_hash text");
    expect(limiterMigration).toContain("key_hash text not null");
    expect(limiterMigration).not.toContain("ip_address");
    expect(limiterMigration).not.toContain("identifier text");
    expect(authFunction).toContain("sha256Hex(`${scope}|${rawKey}`)");
  });

  it("returns a generic temporary failure when recovery protection itself is unavailable", () => {
    const recoveryStart = authFunction.indexOf('if (action === "recover")');
    const catchStart = authFunction.indexOf(
      'console.error("[country-auth] Recovery rate limiting unavailable", error);',
      recoveryStart,
    );
    const resolver = authFunction.indexOf(
      "const resolved = await resolveLoginEmail(identifier);",
      recoveryStart,
    );

    expect(recoveryStart).toBeGreaterThan(-1);
    expect(catchStart).toBeGreaterThan(recoveryStart);
    expect(resolver).toBeGreaterThan(catchStart);
    expect(authFunction.slice(catchStart, resolver)).toContain(
      'Password recovery is temporarily unavailable. Try again shortly.',
    );
    expect(authFunction.slice(catchStart, resolver)).toContain("503");
    expect(authFunction.slice(catchStart, resolver)).not.toContain(
      "recoveryAvailable",
    );

    // Exhaustion is not an infrastructure failure and deliberately retains the
    // generic anti-enumeration envelope.
    expect(authFunction.slice(recoveryStart, catchStart)).toContain(
      "return json({ ok: true, recoveryAvailable: true }, 202);",
    );
  });

  it("rehearses limiter privileges and global write blocking in read_only and maintenance", () => {
    expect(gateRehearsal).toContain('[[ "$privileges" == "false,false,true" ]]');
    expect(gateRehearsal).toContain("set_mode read_only");
    expect(gateRehearsal).toContain("set_mode maintenance");
    expect(gateRehearsal).toContain(
      "/rest/v1/rpc/country_auth_consume_rate_limit",
    );
    expect(gateRehearsal).toContain(
      "/rest/v1/rpc/solaris_claim_pending_notification_deliveries",
    );
    expect(gateRehearsal).toContain('/rest/v1/countries');
    expect(gateRehearsal).toContain("anonymous caller unexpectedly executed the limiter");
    expect(gateRehearsal).toContain("authenticated role unexpectedly executed the limiter");
  });

  it("rehearses real sign-in behavior and rate limiting while read_only", () => {
    expect(signinRehearsal).toContain("mode = 'read_only'");
    expect(signinRehearsal).toContain('[[ "$HTTP_STATUS" == "200" ]]');
    expect(signinRehearsal).toContain('[[ "$HTTP_STATUS" == "401" ]]');
    expect(signinRehearsal).toContain('[[ "$HTTP_STATUS" == "429" ]]');
    expect(signinRehearsal).toContain('action":"signin"');
  });

  it("rehearses recovery infrastructure failure and exhaustion without enumeration", () => {
    expect(protectionFailureRehearsal).toContain(
      "Password recovery is temporarily unavailable. Try again shortly.",
    );
    expect(protectionFailureRehearsal).toContain('[[ "$HTTP_STATUS" == "503" ]]');
    expect(protectionFailureRehearsal).toContain(
      "revoke execute on function public.country_auth_consume_rate_limit",
    );
    expect(protectionFailureRehearsal).toContain("assert_generic_503");
    expect(protectionFailureRehearsal).toContain("assert_generic_recovery_envelope 202");
  });

  it("runs the existing full Mailpit/reset/password cycle inside read_only on clean and upgrade paths", () => {
    expect(readOnlyRecoveryRehearsal).toContain("set_mode read_only");
    expect(readOnlyRecoveryRehearsal).toContain(
      'bash "$script_dir/v3-password-recovery-rehearsal.sh"',
    );

    for (const evidence of [
      "Mailpit did not capture the recovery email",
      "recovery email redirect_to mismatch",
      "recovery redirect did not create a recovery session",
      "set-password did not return ok=true",
      "new-password sign-in did not return accessToken",
      "old password still signed in after reset",
    ]) {
      expect(fullRecoveryRehearsal).toContain(evidence);
    }

    expect(workflow).toContain("v3-password-recovery-read-only-rehearsal.sh");
    expect(workflow).toContain("clean-replay:");
    expect(workflow).toContain("upgrade-from-main:");
  });
});
