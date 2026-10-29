import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261029162500_v3_s16_jury_transport_boundary.sql",
  "utf8",
).toLowerCase();

const reliability = readFileSync(
  "supabase/migrations/20261014132819_v3_jury_reliability_foundation.sql",
  "utf8",
).toLowerCase();

describe("V3 S16 Jury transport boundary", () => {
  it("removes raw API/transport mutation from all current S16 Jury tables", () => {
    for (const table of [
      "public.jury_voting_windows",
      "public.jury_ballot_submissions",
      "public.jury_votes",
      "public.studio2_jury_window_versions",
    ]) {
      expect(migration).toContain(
        `on table ${table}\n  from authenticated, service_role`,
      );
    }
  });

  it("makes submit_country_jury_ballot an inaccessible implementation primitive", () => {
    expect(reliability).toContain(
      "v_ballot_id := public.submit_country_jury_ballot(_show_id, _entries, _preflight_id)",
    );
    expect(migration).toContain(
      "alter function public.submit_country_jury_ballot(uuid, jsonb, uuid)\n  owner to postgres",
    );
    expect(migration).toContain(
      "set search_path = pg_catalog, public, televoting, pg_temp",
    );
    expect(migration).toContain(
      "revoke all on function public.submit_country_jury_ballot(uuid, jsonb, uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  it("removes service-role raw mutation from private draft and operation storage", () => {
    expect(migration).toContain(
      "revoke all on table private.v3_jury_drafts from service_role",
    );
    expect(migration).toContain(
      "revoke all on table private.v3_jury_operations from service_role",
    );
  });

  it("fails replay on renewed raw DML or internal-writer exposure", () => {
    expect(migration).toContain("do $proof$");
    expect(migration).toContain(
      "raw jury dml remains on %",
    );
    expect(migration).toContain(
      "lower-level jury ballot writer remains externally executable",
    );
    expect(migration).toContain(
      "service_role retains raw jury private-storage mutation",
    );
  });
});
