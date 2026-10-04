import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 confirmation authority retirement", () => {
  it("keeps the former Confirmations client as a compatibility alias to canonical Solaris Supabase", () => {
    const client = source("src/integrations/confirmations/client.ts");

    expect(client).toContain(
      'import { supabase as solarisSupabase } from "@/integrations/supabase/client"',
    );
    expect(client).toContain(
      "Confirmations now lives on Solaris Studio's canonical Supabase project.",
    );
    expect(client).toContain(
      "one client, one session and one database",
    );
    expect(client).toContain(
      "export const confirmationsSupabase = solarisSupabase",
    );
  });

  it("models one current requirement per edition and country, independent of rounds", () => {
    const migration = source(
      "supabase/migrations/20261002235000_organisation_os_v5_confirmation_requirements.sql",
    );

    expect(migration).toContain(
      "studio2_confirmation_requirements_current_idx",
    );
    expect(migration).toContain(
      "on public.studio2_confirmation_requirements (edition_id, country_id)",
    );
    expect(migration).toContain("where superseded_at is null");
    expect(migration).toContain(
      "A submission round is",
    );
    expect(migration).toContain("only a window");
  });

  it("prevents later rounds from recreating already-satisfied participation work", () => {
    const migration = source(
      "supabase/migrations/20261002235000_organisation_os_v5_confirmation_requirements.sql",
    );

    expect(migration).toContain(
      "studio2_guard_duplicate_confirmation_submission",
    );
    expect(migration).toContain(
      "v_requirement_status in ('satisfied', 'waived')",
    );
    expect(migration).toContain("requires explicit reconfirmation");
    expect(migration).not.toContain(
      "after insert or update or delete on public.submission_rounds",
    );
  });

  it("makes reconfirmation explicit, audited and versioned rather than round-driven", () => {
    const migration = source(
      "supabase/migrations/20261002235000_organisation_os_v5_confirmation_requirements.sql",
    );

    expect(migration).toContain("admin_confirmation_reconfirm");
    expect(migration).toContain(
      "'confirmation.requirement.reconfirm'",
    );
    expect(migration).toContain("generation + 1");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("'replayed'");
  });

  it("makes participant and Organizer surfaces consume requirement truth", () => {
    const access = source("src/lib/confirmation-country-account.ts");
    const participant = source("src/lib/participation-os.ts");
    const page = source("src/routes/confirmations/index.tsx");
    const admin = source("src/routes/confirmations/admin/requirements.tsx");

    expect(access).toContain(
      "public_country_account_confirmation_requirements",
    );
    expect(participant).toContain(
      "requirements: readonly CountryConfirmationRequirement[]",
    );
    expect(page).toContain("A round is only a submission window");
    expect(admin).toContain(
      "Opening or closing a round remains separate from this decision.",
    );
  });

  it("keeps sync failures as recoverable task projections rather than a second confirmation truth", () => {
    const recovery = source(
      "supabase/migrations/20261003215000_organisation_os_v5_confirmation_sync_recovery.sql",
    );

    expect(recovery).toContain(
      "private.studio2_reconcile_confirmation_sync_tasks",
    );
    expect(recovery).toContain("'confirmation_sync'");
    expect(recovery).toContain(
      "perform private.studio2_sync_task_notifications(null)",
    );
  });
});
