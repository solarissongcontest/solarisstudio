import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261103220000_v3_s14_atomic_televote_recovery.sql"), "utf8");
const audit = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261103210000_v3_s14_televote_sync_audit_rpc.sql"), "utf8");
const code = readFileSync(resolve(process.cwd(),
  "src/integrations/televoting/results-sync.server.ts"), "utf8");

describe("S14 atomic published Televote recovery contract", () => {
  it("requires a service role and guards a published show under lock", () => {
    expect(migration).toContain("auth.role() is distinct from 'service_role'");
    expect(migration).toContain("for update;");
    expect(migration).toContain("private.studio2_publication_has_outcomes(v_show.publication_config)");
    expect(migration).toContain("'studio2-results:' || v_show_id::text");
    expect(migration).toContain("op.calculation_version > 0");
  });

  it("uses canonical source projection, binding freeze, and audit in one transaction", () => {
    expect(migration).toContain("private.v3_sync_published_televote_round(p_source_id)");
    expect(migration).toContain("private.v3_sync_published_televote_aggregation(p_source_id)");
    expect(migration).toContain("set frozen_at = coalesce(binding.frozen_at, now())");
    expect(migration).toContain("public.v3_record_televote_sync_event(");
    expect(code).toContain('"v3_reconcile_published_televote"');
    expect(code).not.toContain('db.from("results").update(values)');
    expect(code).not.toContain('db.from("results").insert(values)');
  });

  it("audits only the confirmed lineup without rejecting retained inactive historical Results", () => {
    const activeCount = audit.match(
      /select count\(\*\) into v_studio_count[\s\S]*?select count\(\*\) into v_orphan_count/,
    )?.[0] ?? "";
    expect(activeCount).toContain("from public.results result_row");
    expect(activeCount).toContain("from public.participants participant");
    expect(activeCount).toContain("participant.show_id = p_show_id");
    expect(activeCount).toContain("coalesce(participant.participation_status, 'confirmed') = 'confirmed'");
    expect(activeCount).toContain("participant.country_id is not null");
    expect(activeCount).toContain("participant.country_id is null");
    expect(activeCount).toContain("result_row.contest_entity_id = participant.contest_entity_id");

    const orphanCount = audit.match(
      /select count\(\*\) into v_orphan_count[\s\S]*?if v_source_count = 0/,
    )?.[0] ?? "";
    expect(orphanCount).toContain("not exists (");
    expect(orphanCount).toContain("from public.participants participant");
    expect(orphanCount).not.toContain("participant.participation_status");
    expect(audit).toContain("v_source_count <> v_studio_count");
    expect(audit).toContain("v_orphan_count <> 0");
    expect(audit).toContain("v_source_count <> v_matched_count");
    expect(audit).toContain("auth.role() is distinct from 'service_role'");
  });

  it("rejects incomplete Combined source bindings and conflicting audit retries", () => {
    expect(audit).toContain("Not every enabled Combined round source is frozen to this show");
    expect(audit).toContain("on conflict (service, event_type, payload_hash) do nothing");
    expect(audit).toContain("IDEMPOTENCY_CONFLICT: Televote sync receipt changed semantics");
  });
});
