import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261102171950_v3_tg1_current_controller_identity_guard.sql",
  ),
  "utf8",
);

describe("TG1 public country-identity current-controller guard", () => {
  it("ties every published controller term to an active canonical country account", () => {
    expect(migration).toContain("left join public.country_accounts current_account");
    expect(migration).toContain("current_account.country_id = c.id");
    expect(migration).toContain("current_account.status = 'active'");
    expect(migration).toContain("term.country_id = c.id");
    expect(migration).toContain("term.ended_at is null");
    expect(migration).toContain("term.user_id = current_account.user_id");
  });

  it("preserves the public projection shape while hiding private user identities", () => {
    expect(migration).toContain("create or replace function public.world_country_identity_v1");
    expect(migration).toContain("controller_person_id uuid");
    expect(migration).toContain("controller_display_name text");
    const projectedColumns = migration.slice(
      migration.indexOf("as $projection$"),
      migration.indexOf("from public.countries c"),
    );
    expect(projectedColumns).not.toContain("current_account.user_id");
    expect(projectedColumns).not.toContain("term.user_id");
    expect(migration).toContain(
      "grant execute on function public.world_country_identity_v1(uuid) to anon, authenticated, service_role;",
    );
  });

  it("is an additive projection fix, not another country-owner mutation API", () => {
    expect(migration).not.toMatch(/update\s+public\.country_accounts/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.country_accounts/i);
    expect(migration).not.toMatch(/create\s+table\s+.*country_accounts/i);
    expect(migration).toContain("v3.tg1.world-current-controller-projection-guard");
    expect(migration).toContain("'forward_fix_only'");
  });
});
