import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261103194500_v3_s14_televote_sync_service_role_acl.sql",
  "utf8",
).toLowerCase();

const sync = readFileSync(
  "src/integrations/televoting/results-sync.server.ts",
  "utf8",
);

describe("Grand Final published Televote synchronization privileges", () => {
  it("grants only the binding privileges needed by the server sync", () => {
    expect(migration.replace(/\s+/g, " ")).toContain(
      "grant select, update on table public.televoting_round_bindings to service_role;",
    );
    expect(migration).not.toContain("disable row level security");
    expect(migration).not.toContain("to anon;");
    expect(migration).not.toContain("grant all");
  });

  it("preserves publication sync and frozen binding behavior through the canonical RPC", () => {
    const recovery = readFileSync(
      "supabase/migrations/20261103220000_v3_s14_atomic_televote_recovery.sql",
      "utf8",
    );

    expect(sync).toContain('.from("televoting_round_bindings")');
    expect(sync).toContain('"v3_reconcile_published_televote"');

    expect(recovery).toContain(
      "set frozen_at = coalesce(binding.frozen_at, now())",
    );
    expect(recovery).toContain(
      "v_frozen_count <> cardinality(v_round_ids)",
    );
    expect(recovery).toContain(
      "perform public.v3_record_televote_sync_event(",
    );
    expect(recovery).toContain(
      "private.studio2_publication_has_outcomes(v_show.publication_config)",
    );
  });
});
