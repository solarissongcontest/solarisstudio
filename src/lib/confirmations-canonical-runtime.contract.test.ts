import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("canonical Confirmations runtime", () => {
  it("keeps public confirmation traffic on the canonical Solaris Supabase project", () => {
    const helper = source("src/integrations/confirmations/public-runtime.server.ts");
    const rounds = source("src/lib/confirmation-rounds.functions.ts");
    const publicFns = source("src/lib/public.functions.ts");
    const edit = source("src/lib/confirmation-edit.functions.ts");
    const recovery = source("src/lib/confirmation-recovery.functions.ts");
    const nextInLine = source("src/lib/confirmation-next-in-line.functions.ts");
    const account = source("src/lib/confirmation-country-account.ts");

    expect(helper).toContain("VITE_SUPABASE_URL");
    expect(helper).toContain('process.env["SUPABASE_URL"]');
    expect(helper).not.toContain("CONFIRMATIONS_SUPABASE_URL");

    for (const file of [rounds, publicFns, edit, recovery, nextInLine]) {
      expect(file).toContain("createConfirmationPublicRuntimeClient");
      expect(file).not.toContain("CONFIRMATIONS_SUPABASE_URL");
      expect(file).not.toContain("CONFIRMATIONS_LEGACY_ANON_KEY");
    }

    expect(account).toContain('import { supabase } from "@/integrations/supabase/client"');
    expect(account).not.toContain("confirmationsSupabase");
  });

  it("retires the standalone Confirmations client and legacy env", () => {
    const client = source("src/integrations/confirmations/client.ts");
    const env = source(".env");

    expect(client).toContain('supabase as solarisSupabase');
    expect(client).toContain("export const confirmationsSupabase = solarisSupabase as any");
    expect(client).not.toContain("createClient");
    expect(client).not.toContain("CONFIRMATIONS_LEGACY_ANON_KEY");
    expect(client).not.toContain("VITE_CONFIRMATIONS_SUPABASE");
    expect(env).not.toContain("CONFIRMATIONS_SUPABASE_");
    expect(env).not.toContain("xwvnrpuqehqcatowxfpx");
  });

  it("tracks canonical migrations with the same versions already applied live", () => {
    const runtime = source("supabase/migrations/20261002134652_canonical_confirmations_public_runtime.sql");
    const authFix = source("supabase/migrations/20261002135053_fix_canonical_confirmations_auth_uid.sql");
    const grants = source("supabase/migrations/20261002140253_harden_canonical_confirmations_rpc_grants.sql");
    const admin = source("supabase/migrations/20261002144948_canonical_confirmations_admin_runtime.sql");
    const compatibility = source("supabase/migrations/20261002150614_confirmations_edition_editing_compat.sql");
    const controls = source("supabase/migrations/20261002184144_fix_confirmation_round_reopen_and_editing.sql");

    expect(runtime).toContain("public.public_confirmation_rounds()");
    expect(runtime).toContain("public.public_country_account_confirmation_access()");
    expect(runtime).toContain("public.public_create_country_account_edit_token(_round_id uuid)");
    expect(authFix).toContain("caller_user_id uuid := auth.uid()");
    expect(grants).toContain("revoke execute on function public.public_country_account_confirmation_access() from anon");
    expect(admin).toContain("admin_confirmation_editions");
    expect(compatibility).toContain("editing_enabled");
    expect(controls).toContain("closes_at <= now() then null");
    expect(controls).toContain("editing_allowed = _enabled");
  });
});
