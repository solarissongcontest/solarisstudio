import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const aliasMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019112900_v3_s13_migration_registration_context.sql",
  ),
  "utf8",
);
const strictRestore = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019113300_v3_s13_strict_registration_restore.sql",
  ),
  "utf8",
);

describe("System V3 S13 migration registration context", () => {
  it("allows owner-run migrations without granting browser execution", () => {
    expect(aliasMigration).toContain(
      "session_user in ('postgres', 'supabase_admin') and v_request_role is null",
    );
    expect(aliasMigration).toContain(
      "Service role or migration owner context required",
    );
    expect(aliasMigration).toContain(
      "revoke all on function public.v3_register_migration_contract",
    );
    expect(aliasMigration).toContain("from public, anon, authenticated");
    expect(aliasMigration).toContain("to service_role");
  });

  it("canonicalizes only the three reviewed S6 filename aliases", () => {
    const aliases = [
      [
        "20261019113000_v3_s6_notification_reconciliation",
        "v3.s6.notification-reconciliation",
      ],
      [
        "20261019113100_v3_s6_notification_reactivation",
        "v3.s6.notification-reactivation",
      ],
      [
        "20261019113200_v3_s6_notification_failure_visibility",
        "v3.s6.notification-failure-visibility",
      ],
    ] as const;

    for (const [legacy, canonical] of aliases) {
      expect(aliasMigration).toContain(`when '${legacy}'`);
      expect(aliasMigration).toContain(`then '${canonical}'`);
    }
    expect(aliasMigration).toContain("else p_migration_key");
    expect(aliasMigration).toContain(
      "v_migration_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'",
    );
    expect(aliasMigration).not.toContain("regexp_replace(p_migration_key");
  });

  it("restores strict semantic-key validation immediately after the notification migrations", () => {
    expect(strictRestore).toContain("'v3.s13.strict-registration-restore'");
    expect(strictRestore).toContain(
      "p_migration_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'",
    );
    expect(strictRestore).not.toContain("20261019113000_v3_s6_notification_reconciliation");
    expect(strictRestore).not.toContain("20261019113100_v3_s6_notification_reactivation");
    expect(strictRestore).not.toContain("20261019113200_v3_s6_notification_failure_visibility");
    expect(strictRestore).not.toContain("v_migration_key");
  });
});
