import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const signedMigration = readFileSync(
  new URL("../../supabase/migrations/20261108004000_v3_s14_signed_combined_projection.sql", import.meta.url),
  "utf8",
);

describe("SSC v4.2 Rule 17.2: signed Combined publication boundary", () => {
  it("accepts signed Combined final scores without allowing negative raw-round allocations", () => {
    expect(signedMigration).toContain("p_source_type = 'round'");
    expect(signedMigration).toContain("!~ '^[0-9]+$'");
    expect(signedMigration).toContain("p_source_type = 'combined'");
    expect(signedMigration).toContain("!~ '^-?[0-9]+$'");
    expect(signedMigration).toContain("::numeric < -2147483648");
    expect(signedMigration).toContain("::numeric > 2147483647");
  });

  it("allows a negative Combined aggregate while keeping round totals nonnegative", () => {
    expect(signedMigration).toContain("source_type = 'combined' or points_total >= 0");
    expect(signedMigration).toContain("v3_televote_result_projection_sources_points_total_check");
    expect(signedMigration).toContain("v3_televote_result_projection_sources_signed_combined_total_chk");
  });

  it("retains the existing replay-hardened server-authoritative function and ACL", () => {
    expect(signedMigration).toContain("create or replace function private.v3_apply_published_televote_projection(");
    expect(signedMigration).toContain("v_current_fingerprint");
    expect(signedMigration).toContain("v_replayed");
    expect(signedMigration).toContain("perform public.sync_show_results_from_votes");
    expect(signedMigration).toContain("revoke all on function private.v3_apply_published_televote_projection(");
    expect(signedMigration).toContain("from public, anon, authenticated");
  });
});
