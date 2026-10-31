import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023205600_v3_jury_share_rollout_gate.sql",
  ),
  "utf8",
);

describe("System V3 Jury Share rollout gate", () => {
  it("registers the migration and seeds the canonical feature disabled", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.jury-share-rollout-gate-v1'");
    expect(migration).toContain("'jury_share_cards_v1'");
    expect(migration).toContain("'jury_share_cards_v1', false, false");
    expect(migration).toContain("on conflict (key) do nothing");
  });

  it("preserves the existing feature allow-list while adding only the new key", () => {
    for (const key of [
      "solaris_app_v3",
      "solaris_app_v3_confirmation",
      "solaris_app_v3_results",
      "solaris_app_v3_jury",
      "solaris_app_v3_live",
      "solaris_app_v3_organizer",
      "jury_share_cards_v1",
    ]) {
      expect(migration).toContain(`'${key}'`);
    }
  });

  it("moves the unrestricted implementation behind a private core", () => {
    expect(migration).toContain(
      "alter function public.v3_jury_share_projection(uuid, uuid)\n  set schema private;",
    );
    expect(migration).toContain(
      "rename to v3_jury_share_projection_core;",
    );
    expect(migration).toContain(
      "revoke all on function private.v3_jury_share_projection_core(uuid, uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role;");
  });

  it("fails user/browser callers closed through canonical edition-aware rollout", () => {
    expect(migration).toContain("private.studio2_request_is_service_role()");
    expect(migration).toContain("private.studio2_feature_enabled_for(");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("'jury_share_cards_v1'");
    expect(migration).toContain("v_edition_id");
    expect(migration).toContain("JURY_SHARE_FEATURE_DISABLED");
  });

  it("keeps the stable public RPC name while delegating authority to the private core", () => {
    expect(migration).toContain(
      "create or replace function public.v3_jury_share_projection(",
    );
    expect(migration).toContain(
      "return private.v3_jury_share_projection_core(",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_jury_share_projection(uuid, uuid)\n  to anon, authenticated, service_role;",
    );
  });
});
