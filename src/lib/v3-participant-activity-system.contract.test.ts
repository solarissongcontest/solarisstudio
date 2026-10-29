import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019213500_v3_participant_activity_projection.sql",
  ),
  "utf8",
);

const consumer = readFileSync(
  resolve(process.cwd(), "src/integrations/v3/participant-activity.server.ts"),
  "utf8",
);

describe("V3 participant activity System projection", () => {
  it("adds the exact recipient-scoped RPC the existing Public consumer expects", () => {
    expect(migration).toContain(
      "create or replace function public.v3_my_participant_activity(",
    );
    expect(consumer).toContain('rpc("v3_my_participant_activity"');
    expect(consumer).toContain("p_before:");
    expect(consumer).toContain("p_limit:");
    expect(migration).toContain("p_before timestamptz default null");
    expect(migration).toContain("p_limit integer default 30");
    expect(migration).toContain("p_before_operation_id uuid default null");
  });

  it("registers a forward-only S13 migration contract", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain(
      "'v3.participant-activity.recipient-projection'",
    );
    expect(migration).toContain("'forward_fix_only'");
  });

  it("derives history only from the authenticated viewer's canonical completed operations", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("receipt.actor_id = v_actor");
    expect(migration).toContain("receipt.status = 'succeeded'");
    expect(migration).toContain("jury_op.user_id = v_actor");
    expect(migration).toContain("private.v3_jury_operations jury_op");
    expect(migration).not.toContain("p_user_id");
    expect(migration).not.toContain("p_country_id");
    expect(migration).not.toContain("p_edition_id");
  });

  it("allowlists safe participation families instead of projecting the global receipt ledger", () => {
    expect(migration).toContain("'confirmation.submit'");
    expect(migration).toContain("'entry.submit'");
    expect(migration).toContain("'jury.submit'::text");
    expect(migration).toContain("'televote.submit'");
    expect(migration).not.toContain("receipt.command like");
    expect(migration).not.toContain("receipt.command not in");
  });

  it("never exposes request payloads, ballot rankings, audit or outbox internals", () => {
    // Comments describe the forbidden source; executable SQL must never query it.
    const executable = migration.replace(/--[^\n]*/g, " ");
    expect(executable).not.toMatch(/\b(?:from|join)\s+(?:public\.)?jury_votes\b/i);
    expect(migration).not.toContain("request_fingerprint',");
    expect(migration).not.toContain("idempotency_key',");
    expect(migration).not.toContain("admin_audit_log");
    expect(migration).not.toContain("v3_domain_events");
    expect(migration).not.toContain("v3_event_outbox");
    expect(migration).not.toContain("payload ->");
    expect(migration).toContain(
      "jsonb_build_object('ballotSubmissionId', jury_op.ballot_submission_id)",
    );
  });

  it("returns the Public P40 activity shape with safe server-owned routes", () => {
    for (const field of [
      "'id', shaped.id",
      "'occurred_at', shaped.occurred_at",
      "'kind', shaped.kind",
      "'title', shaped.title",
      "'description', shaped.description",
      "'edition_id', shaped.edition_id",
      "'edition_label', edition.name",
      "'country_id', shaped.country_id",
      "'route', shaped.route",
      "'receipt_id', shaped.receipt_id",
      "'source_event_type', shaped.source_event_type",
      "'reconciliation_state', shaped.reconciliation_state",
    ]) {
      expect(migration).toContain(field);
    }

    expect(migration).toContain("'/participate'");
    expect(migration).toContain("'/jury-voting'");
    expect(migration).toContain("'/televoting'");
    expect(migration).not.toContain("http://");
    expect(migration).not.toContain("https://");
  });

  it("marks corrected or missing canonical state instead of deleting historical activity", () => {
    expect(migration).toContain("then 'unavailable'");
    expect(migration).toContain("then 'superseded'");
    expect(migration).toContain("else 'current'");
    expect(migration).toContain("submission.edit_count >");
    expect(migration).toContain("internal_entry.current_version_id");
    expect(migration).toContain("nf_entry.current_version_id");
    expect(migration).toContain("ballot.status in ('invalidated', 'superseded')");
  });

  it("keeps the first page bounded and provides a stable tie-break cursor", () => {
    expect(migration).toContain(
      "least(greatest(coalesce(p_limit, 30), 1), 50)",
    );
    expect(migration).toContain("limit v_limit + 1");
    expect(migration).toContain("v3_activity_receipt_recipient_cursor_idx");
    expect(migration).toContain("v3_activity_jury_recipient_cursor_idx");
    expect(migration).toContain(
      "(activity.occurred_at, activity.sort_id)\n             < (p_before, p_before_operation_id)",
    );
    expect(migration).toContain("'next_before'");
    expect(migration).toContain("'next_operation_id'");
    expect(migration).toContain("'generated_at', now()");
  });

  it("exposes only an authenticated narrow SECURITY DEFINER read surface", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("to authenticated;");
  });
});
