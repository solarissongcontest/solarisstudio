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

  it("retires the standalone Confirmations Supabase client and admin bridge", () => {
    const client = source("src/integrations/confirmations/client.ts");
    const adminMigration = source(
      "supabase/migrations/20261002174000_canonical_confirmations_admin_runtime.sql",
    );
    const env = source(".env");

    expect(client).toContain('supabase as solarisSupabase');
    expect(client).toContain("export const confirmationsSupabase = solarisSupabase as any");
    expect(client).not.toContain("createClient");
    expect(client).not.toContain("CONFIRMATIONS_LEGACY_ANON_KEY");
    expect(client).not.toContain("VITE_CONFIRMATIONS_SUPABASE");
    expect(env).not.toContain("CONFIRMATIONS_SUPABASE_");
    expect(env).not.toContain("xwvnrpuqehqcatowxfpx");

    for (const rpc of [
      "admin_confirmation_editions",
      "admin_confirmation_responses",
      "admin_confirmation_response",
      "admin_review_confirmation_entry",
      "admin_confirmation_technical",
      "admin_confirmation_version_summary",
      "admin_confirmation_versions",
      "admin_restore_confirmation_version",
      "set_confirmation_national_final_winner_from_solaris",
    ]) {
      expect(adminMigration).toContain(rpc);
    }

    expect(adminMigration).toContain("private.solaris_confirmation_admin_allowed");
    expect(adminMigration).toContain("delegation.manage");
    expect(adminMigration).not.toContain("oxtbskojiexkaspputvo");
  });

  it("restores the three public RPCs that were missing after the Supabase migration", () => {
    const runtime = source(
      "supabase/migrations/20261002164500_canonical_confirmations_public_runtime.sql",
    );
    const authFix = source(
      "supabase/migrations/20261002165500_fix_canonical_confirmations_auth_uid.sql",
    );

    expect(runtime).toContain("public.public_confirmation_rounds()");
    expect(runtime).toContain("public.public_country_account_confirmation_access()");
    expect(runtime).toContain("public.public_create_country_account_edit_token(_round_id uuid)");
    expect(runtime).not.toContain("http(");
    expect(runtime).not.toContain("oxtbskojiexkaspputvo");
    expect(authFix).toContain("caller_user_id uuid := auth.uid()");
    expect(authFix).not.toContain("current_user uuid");
  });

  it("gives confirmation route failures a recoverable in-app state", () => {
    const route = source("src/routes/confirmations/index.tsx");

    expect(route).toContain("errorComponent: ConfirmationsRouteError");
    expect(route).toContain("Try again");
    expect(route).toContain("router.invalidate()");
    expect(route).toContain("Your saved response has not been changed.");
  });

  it("keeps anonymous browsing separate from authenticated country editing", () => {
    const runtime = source(
      "supabase/migrations/20261002164500_canonical_confirmations_public_runtime.sql",
    );
    const authFix = source(
      "supabase/migrations/20261002165500_fix_canonical_confirmations_auth_uid.sql",
    );
    const grants = source(
      "supabase/migrations/20261002170500_harden_canonical_confirmations_rpc_grants.sql",
    );
    const account = source("src/lib/confirmation-country-account.ts");

    expect(runtime).toContain(
      "grant execute on function public.public_confirmation_rounds() to anon, authenticated",
    );
    expect(grants).toContain(
      "revoke execute on function public.public_country_account_confirmation_access() from anon",
    );
    expect(grants).toContain(
      "revoke execute on function public.public_create_country_account_edit_token(uuid) from anon",
    );
    expect(grants).toContain(
      "grant execute on function public.public_create_country_account_edit_token(uuid) to authenticated",
    );
    expect(account).toContain("if (!sessionData.session)");
    expect(authFix).toContain("ca.user_id = caller_user_id");
    expect(authFix).toContain("ca.status = 'active'");
  });
  it("keeps organizer round controls consistent with participant availability", () => {
    const controls = source(
      "supabase/migrations/20261002212500_fix_confirmation_round_reopen_and_editing.sql",
    );

    expect(controls).toContain("closes_at <= now() then null");
    expect(controls).toContain("opens_at is null or opens_at > now()");
    expect(controls).toContain("Increase the response limit before reopening this full round");
    expect(controls).toContain("set editing_allowed = _enabled");
    expect(controls).toContain("set editing_enabled = true");
    expect(controls).toContain("editing_allowed is distinct from _enabled");
  });

});
