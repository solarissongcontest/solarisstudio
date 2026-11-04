import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const commandMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020003500_country_account_access_commands.sql",
  ),
  "utf8",
);
const compatibilityMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020003600_country_account_legacy_compatibility_window.sql",
  ),
  "utf8",
);
const client = readFileSync(
  resolve(process.cwd(), "src/lib/v3-country-account-access.ts"),
  "utf8",
);

describe("V3 country-account suspension/restoration authority", () => {
  it("registers additive S13 migration contracts", () => {
    expect(commandMigration).toContain("public.v3_register_migration_contract(");
    expect(commandMigration).toContain("20261020003500_country_account_access_commands");
    expect(compatibilityMigration).toContain("public.v3_register_migration_contract(");
    expect(compatibilityMigration).toContain("20261020003600_country_account_legacy_compatibility_window");
    expect(commandMigration).not.toMatch(/\bdrop\s+(?:table|column|schema)\b/i);
  });

  it("preflights the exact account, current revision and session consequence", () => {
    expect(commandMigration).toContain("studio2_country_account_access_preview");
    expect(commandMigration).toContain("account.user_id = p_user_id");
    expect(commandMigration).toContain("studio2_access_allowed('delegation.manage', null, true)");
    expect(commandMigration).toContain("'expectedVersion', v_account.updated_at");
    expect(commandMigration).toContain("'sessionPolicy', 'preserve_authenticated_session'");
    expect(commandMigration).toContain("'blockers', v_blockers");
  });

  it("uses the canonical delegation suspend/restore command identities", () => {
    expect(commandMigration).toContain("then 'delegation.suspend'");
    expect(commandMigration).toContain("else 'delegation.restore'");
    expect(commandMigration).toContain("private.studio2_claim_operation(");
    expect(commandMigration).toContain("'R2'");
  });

  it("performs CAS after row lock and rejects stale account state", () => {
    const lock = commandMigration.indexOf("where account.user_id = p_user_id\n  for update;");
    const cas = commandMigration.indexOf("v_before.updated_at is distinct from p_expected_updated_at");
    const update = commandMigration.indexOf("update public.country_accounts\n  set", cas);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(cas).toBeGreaterThan(lock);
    expect(update).toBeGreaterThan(cas);
    expect(commandMigration).toContain("Country account changed since the reviewed state");
  });

  it("records before/after audit evidence and an authoritative operation receipt", () => {
    expect(commandMigration).toContain("insert into public.admin_audit_log");
    expect(commandMigration).toContain("'country_account_suspended'");
    expect(commandMigration).toContain("'country_account_restored'");
    expect(commandMigration).toContain("'previousVersion', v_before.updated_at");
    expect(commandMigration).toContain("'version', v_after.updated_at");
    expect(commandMigration).toContain("'receiptId', v_operation_id");
    expect(commandMigration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("exposes a typed exact-subject client without silently accepting contradictory receipts", () => {
    expect(client).toContain('"studio2_country_account_access_preview"');
    expect(client).toContain('"studio2_apply_country_account_access"');
    expect(client).toContain("p_expected_updated_at: input.expectedVersion");
    expect(client).toContain("result.operationId !== operationId");
    expect(client).toContain("result.receiptId !== operationId");
    expect(client).toContain("result.userId !== userId");
    expect(client).toContain("result.status !== input.targetStatus");
  });

  it("keeps old authenticated clients working until the consumer cutover actually lands", () => {
    expect(commandMigration).toContain(
      "revoke all on function public.admin_set_country_account_status(uuid, text, text)",
    );
    expect(compatibilityMigration).toContain(
      "grant execute on function public.admin_set_country_account_status(uuid, text, text)",
    );
    expect(compatibilityMigration).toContain("to authenticated, service_role");
    expect(compatibilityMigration).toContain("Remove authenticated execute only after the Organizer country-account consumer is cut over");
  });
});
