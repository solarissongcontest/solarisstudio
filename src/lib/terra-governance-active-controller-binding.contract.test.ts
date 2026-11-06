import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261102170500_v3_tg1_world_country_control_foundation.sql"),
  "utf8",
);

describe("TG1 country controller/person binding on current authority", () => {
  const bind = migration.split(
    "create or replace function public.world_bind_country_controller_person_v1(",
  )[1]?.split("end\n$bind$;")[0];

  it("requires a canonical active owner and locks it before writing current history", () => {
    expect(bind).toBeDefined();
    expect(bind).toMatch(/select ca\.user_id into v_current_user_id\s+from public\.country_accounts ca\s+where ca\.country_id = p_country_id\s+and ca\.status = 'active'\s+for update;/);
    expect(bind).toContain("message = 'STATE_CHANGED'");
    expect(bind).toContain("v_current_user_id is null");
    expect(bind).toContain("v_existing.user_id is not distinct from v_current_user_id");
  });

  it("does not replace country_accounts or grant arbitrary current ownership", () => {
    expect(bind).not.toMatch(/(?:insert into|update|delete from)\s+public\.country_accounts/i);
    expect(bind).toContain("p_expected_current_user_id");
    expect(bind).toContain("VERSION_CONFLICT");
    expect(bind).toContain("private.studio2_claim_operation");
    expect(bind).toContain("private.v3_emit_domain_event");
  });

  it("preserves source-level safety under future migration changes", () => {
    expect(migration).toContain("create unique index if not exists world_country_control_terms_one_open_per_country");
    expect(migration).toContain("public.country_accounts remains the sole CURRENT controller authority");
  });
});
