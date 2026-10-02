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
});
