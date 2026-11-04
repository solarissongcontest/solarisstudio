import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20261104120600_v3_tg1_controller_login_privacy.sql");
const currentProjection = source(
  "supabase/migrations/20261104120700_v3_tg1_canonical_current_controller_projection.sql",
);
const tg1Foundation = source(
  "supabase/migrations/20261102170500_v3_tg1_world_country_control_foundation.sql",
);
const identityRehearsal = source(
  ".github/scripts/v3-tg2-identity-linkage-privacy-rehearsal.sql",
);
const identityRunner = source(
  ".github/scripts/v3-tg2-identity-linkage-privacy-rehearsal.sh",
);

describe("TG1 controller history login linkage", () => {
  it("keeps current authority and public identity separate from private raw history", () => {
    expect(tg1Foundation).toContain(
      "public.country_accounts remains the sole CURRENT controller authority",
    );
    expect(tg1Foundation).toContain("user_id uuid null references auth.users(id) on delete set null");
    const publicProjection = tg1Foundation.slice(
      tg1Foundation.indexOf("create or replace function public.world_country_identity_v1"),
      tg1Foundation.indexOf("create or replace function public.world_bind_country_controller_person_v1"),
    );
    expect(publicProjection).not.toMatch(/\buser_id\b/);
    expect(migration).not.toMatch(/update\s+public\.country_accounts/i);
  });

  it("revokes edition/delegation-wide raw history reads without losing self and platform access", () => {
    const policy = migration.match(
      /create policy world_country_control_terms_read[\s\S]*?using \(([\s\S]*?)\);\s*comment on policy/i,
    )?.[1];
    expect(policy).toBeDefined();
    expect(policy).toContain("user_id = (select auth.uid())");
    expect(policy).toContain("studio2_access_allowed('system.manage', null, false)");
    expect(policy).not.toContain("delegation.read");
    expect(migration).toContain("drop policy if exists world_country_control_terms_read");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]{0,120}\sto\s+(anon|authenticated)/i);
  });

  it("never reports a stale history term as the active country's controller", () => {
    expect(currentProjection).toContain("create or replace function public.world_country_identity_v1");
    expect(currentProjection).toContain("left join public.country_accounts account_row");
    expect(currentProjection).toContain("account_row.status = 'active'");
    expect(currentProjection).toContain("term.user_id = account_row.user_id");
    expect(currentProjection).toContain("term.ended_at is null");
    expect(currentProjection).toContain("'forward_fix_only'");
    expect(currentProjection).not.toContain("update public.country_accounts");
    const publicReturn = currentProjection.slice(
      currentProjection.indexOf("returns table ("),
      currentProjection.indexOf("language sql"),
    );
    expect(publicReturn).not.toMatch(/\buser_id\b/);
    expect(identityRehearsal).toContain("TG1_CONTROLLER_PROJECTION_STALE_TRANSFER_LEAK");
    expect(identityRehearsal).toContain("TG1_CONTROLLER_PROJECTION_INACTIVE_ACCOUNT_LEAK");
  });

  it("keeps the verified local-only rollback rehearsal as the executed negative test", () => {
    expect(identityRunner).toContain("supabase status -o env");
    expect(identityRunner).toContain("Refusing hosted Supabase rehearsal");
    expect(identityRehearsal).toContain("TG1_CONTROLLER_LINK_UNRELATED_LOGIN_LEAK");
    expect(identityRehearsal).toContain("TG1_CONTROLLER_LINK_SELF_READ_LOST");
    expect(identityRehearsal).toContain("TG1_CONTROLLER_LINK_MANAGER_WORLD_SCOPE_BYPASS");
    expect(identityRehearsal).toContain("rollback;");
  });
});
