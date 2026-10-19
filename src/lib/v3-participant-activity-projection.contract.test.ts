import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019213000_v3_participant_activity_projection.sql",
  ),
  "utf8",
);

describe("V3 participant Activity projection", () => {
  it("registers a forward-only S13 migration and creates only a derived read contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract");
    expect(migration).toContain("20261019213000_v3_participant_activity_projection");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("create or replace function public.v3_my_participant_activity(");
    expect(migration).not.toMatch(/create\s+table[^;]*activity/i);
    expect(migration).not.toMatch(/insert\s+into[^;]*activity/i);
    expect(migration).not.toMatch(/update\s+[^;]*activity/i);
  });

  it("derives recipient identity exclusively from auth.uid and filters both evidence sources", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("if v_actor is null then");
    expect(migration).toContain("receipt.actor_id = v_actor");
    expect(migration).toContain("event.actor_id = v_actor");
    expect(migration).not.toMatch(/p_(user|actor|viewer)_id/i);
  });

  it("requires successful caller-owned participant operations from an explicit allowlist", () => {
    expect(migration).toContain("receipt.status = 'succeeded'");
    for (const command of [
      "confirmation.submit",
      "entry.submit",
      "entry.resubmit",
      "televote.submit",
      "next_in_line.submit",
      "media.finalize_upload",
    ]) {
      expect(migration).toContain(`'${command}'`);
    }
    expect(migration).not.toContain("confirmation.round.editing");
    expect(migration).not.toContain("results.publish");
    expect(migration).not.toContain("permissions.grant");
  });

  it("does not manufacture Prediction/Fantasy participant truth before canonical submit operations exist", () => {
    expect(migration).not.toContain("prediction.changed");
    expect(migration).not.toContain("prediction.submit");
    expect(migration).not.toContain("fantasy.submit");
    expect(migration).not.toContain("fantasy.locked");
  });

  it("supports canonical event-only participation without duplicating receipt-backed operations", () => {
    for (const eventType of [
      "confirmation.submitted",
      "entry.submitted",
      "entry.resubmitted",
      "jury.ballot_submitted",
      "televote.ballot_submitted",
      "next_in_line.submitted",
    ]) {
      expect(migration).toContain(`'${eventType}'`);
    }
    expect(migration).toContain("select distinct on (event.operation_id)");
    expect(migration).toContain("receipt.operation_id = event.operation_id");
    expect(migration).toContain("and not exists (");
  });

  it("never projects ballot content, raw command payloads or audit internals", () => {
    const outputStart = migration.indexOf("select jsonb_agg(");
    const outputEnd = migration.indexOf("from visible visible_row", outputStart);
    const output = migration.slice(outputStart, outputEnd);

    for (const forbidden of [
      "payload",
      "scope",
      "result",
      "request_fingerprint",
      "correlation_id",
      "actor_id",
      "auth_freshness_evidence",
      "error_metadata",
      "awards",
      "rank",
      "points",
      "choice",
    ]) {
      expect(output).not.toContain(forbidden);
    }

    expect(output).toContain("'receipt_id'");
    expect(output).toContain("'source_event_type'");
    expect(output).toContain("'reconciliation_state'");
  });

  it("uses a server-owned route policy instead of forwarding arbitrary stored URLs", () => {
    expect(migration).toContain("'route', null");
    expect(migration).not.toContain("receipt.scope ->> 'route'");
    expect(migration).not.toContain("event.payload ->> 'route'");
  });

  it("bounds reads and requires a stable timestamp plus UUID cursor pair", () => {
    expect(migration).toContain("v_limit < 1 or v_limit > 50");
    expect(migration).toContain("(p_before is null) <> (p_before_id is null)");
    expect(migration).toContain(
      "(shaped.occurred_at, shaped.id) < (p_before, p_before_id)",
    );
    expect(migration).toContain("order by occurred_at desc, id desc");
    expect(migration).toContain("limit v_limit + 1");
    expect(migration).toContain("'next_before_id'");
  });

  it("returns safe reconciliation state and makes missing historical context unavailable", () => {
    expect(migration).toContain(
      "event.payload ->> 'reconciliationState' in ('current', 'superseded', 'unavailable')",
    );
    expect(migration).toContain("candidate.edition_id is not null and edition.id is null");
    expect(migration).toContain("then 'unavailable'");
    expect(migration).toContain("else 'current'");
  });

  it("keeps raw ledgers private and grants only the shaped RPC to authenticated callers", () => {
    expect(migration).toContain(
      "revoke all on function public.v3_my_participant_activity(timestamptz, uuid, integer)",
    );
    expect(migration).toContain("from public, anon;");
    expect(migration).toContain(
      "grant execute on function public.v3_my_participant_activity(timestamptz, uuid, integer)",
    );
    expect(migration).toContain("to authenticated;");
    expect(migration).not.toMatch(/grant\s+(select|all)\s+on\s+(table\s+)?public\.studio2_operation_receipts/i);
    expect(migration).not.toMatch(/grant\s+(select|all)\s+on\s+(table\s+)?private\.v3_domain_events/i);
  });

  it("collapses each operation to one newest eligible DomainEvent before pagination", () => {
    expect(migration).toContain("order by domain_event.occurred_at desc, domain_event.id desc");
    expect(migration).toContain("limit 1");
    expect(migration).toContain("coalesce(event.id, receipt.operation_id) as id");
  });
});
