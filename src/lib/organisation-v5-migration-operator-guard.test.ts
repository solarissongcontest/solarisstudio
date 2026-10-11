import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 migration operator guard", () => {
  const bridge = source(
    "supabase/migrations/20261003191500_organisation_os_v5_cli_migration_operator_guard.sql",
  );
  const reassert = source(
    "supabase/migrations/20261003210500_organisation_os_v5_cli_migration_operator_guard_reassert.sql",
  );

  it("recognizes Supabase CLI through postgres role membership without trusting SECURITY DEFINER current_user", () => {
    for (const migration of [bridge, reassert]) {
      expect(migration).toContain(
        "pg_has_role(session_user, 'postgres', 'member')",
      );
      expect(migration).toContain(
        "session_user in ('postgres', 'supabase_admin')",
      );
      expect(migration).not.toContain(
        "pg_has_role(current_user, 'postgres', 'member')",
      );
    }
  });

  it("keeps the explicit recovery transaction bypass and restricted-mode fail-closed behavior", () => {
    for (const migration of [bridge, reassert]) {
      expect(migration).toContain(
        "current_setting('studio2.platform_recovery_write', true)",
      );
      expect(migration).toContain("v_mode in ('read_only', 'maintenance')");
      expect(migration).toContain("using errcode = '25006'");
    }
  });
});
