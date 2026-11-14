import { describe, expect, it } from "vitest";
import { V3_S16_CRITICAL_DOMAINS } from "./v3-s16-mutation-authority";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Confirmation S16 governed response-access cutover", () => {
  const confirmation = V3_S16_CRITICAL_DOMAINS.find((domain) => domain.id === "confirmation");
  const grants = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261114184000_v3_confirmation_legacy_access_grants_retirement.sql",
    ),
    "utf8",
  );
  const readMigration = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261114182000_v3_confirmation_exact_edition_reads.sql",
    ),
    "utf8",
  );
  const ownerOnly = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261114191333_v3_confirmation_legacy_writers_owner_only.sql",
    ),
    "utf8",
  );

  it("classifies one versioned response-access writer", () => {
    expect(confirmation?.canonicalCommands).toContain(
      "studio2_apply_confirmation_response_access_change",
    );
    expect(confirmation?.canonicalCommands).not.toContain("admin_update_confirmation_controls");
    expect(confirmation?.sanctionedWriteTriggers).toContain(
      "v3_touch_confirmation_response_access_version",
    );
    expect(confirmation?.sanctionedWriteTriggers).toContain(
      "v3_touch_confirmation_edit_token_version",
    );
  });
  it("declares legacy direct response writers internal-only and revokes their normal API grants", () => {
    for (const name of [
      "admin_update_confirmation_controls",
      "admin_confirmation_create_edit_token",
      "admin_confirmation_revoke_edit_token",
      "admin_confirmation_delete_response",
    ]) {
      expect(confirmation?.directRpcDeniedInternalWriters).toContain(name);
      expect(grants).toContain("public." + name + "(");
    }
    expect(grants).toContain("from public, anon, authenticated");
    expect(grants).toContain("has_function_privilege('authenticated'");
  });
  it("requires exact-edition read and restricted technical/recovery credentials", () => {
    expect(readMigration).toContain("v3.confirmation.exact-edition-reads");
    expect(readMigration).toContain(
      "private.solaris_confirmation_admin_read_allowed(_edition_id, false)",
    );
    expect(readMigration).toContain(
      "studio2_access_allowed('confirmation.manage', _edition_id, false)",
    );
    expect(readMigration).toContain("admin_confirmation_recovery_codes_for_edition");
  });
  it("closes service-role compatibility after governed consumer adoption", () => {
    expect(ownerOnly).toContain("from public,anon,authenticated,service_role");
    expect(ownerOnly).toContain("array['anon','authenticated','service_role']");
    expect(ownerOnly).toContain("pg_get_userbyid(routine.proowner)<>'postgres'");
    expect(ownerOnly).toContain(
      "studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)",
    );
    const runtime = readFileSync(
      resolve(process.cwd(), ".github/scripts/v3-confirmation-legacy-writer-denial.sql"),
      "utf8",
    );
    expect(runtime).toContain("exception when insufficient_privilege");
    expect(runtime).toContain("begin transaction read only");
  });
});
