import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = () =>
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261012010000_v3_confirmation_authority.sql",
    ),
    "utf8",
  );

const serverFunctions = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-confirmation.functions.ts"),
    "utf8",
  );

describe("V3 Confirmation authoritative mutation boundary", () => {
  it("wraps the proven legacy submit without replacing its public contract", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.v3_submit_confirmation");
    expect(sql).toContain("select to_jsonb(public.submit_confirmation(payload)) into v_result");
    expect(sql).not.toContain("create or replace function public.submit_confirmation");
    expect(sql).not.toContain("revoke all on function public.submit_confirmation");
  });

  it("serializes duplicate requests before the protected mutation and stores an authoritative receipt", () => {
    const sql = migration();
    const lock = sql.indexOf("pg_advisory_xact_lock");
    const lookup = sql.indexOf("from private.v3_confirmation_operations operation");
    const submit = sql.indexOf("public.submit_confirmation(payload)");
    const receiptInsert = sql.indexOf("insert into private.v3_confirmation_operations");

    expect(lock).toBeGreaterThan(-1);
    expect(lookup).toBeGreaterThan(lock);
    expect(submit).toBeGreaterThan(lookup);
    expect(receiptInsert).toBeGreaterThan(submit);
    expect(sql).toContain("idempotency_key uuid primary key");
    expect(sql).toContain("receipt_id uuid not null unique");
    expect(sql).toContain("'authority', 'authoritative_server'");
    expect(sql).toContain("'replayed', true");
  });

  it("rejects idempotency-key reuse for a different logical request", () => {
    const sql = migration();

    expect(sql).toContain("v_existing.request_hash <> _request_hash");
    expect(sql).toContain("v_existing.round_id <> v_round_id");
    expect(sql).toContain("v_existing.browser_session_id <> _browser_session_id");
    expect(sql).toContain("idempotency key was already used for a different request");
  });

  it("reconciles ambiguous outcomes only inside the originating browser-session scope", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.v3_reconcile_confirmation");
    expect(sql).toContain("operation.idempotency_key = _idempotency_key");
    expect(sql).toContain("operation.browser_session_id = _browser_session_id");
    expect(sql).toContain("jsonb_build_object('found', false)");
  });

  it("keeps the private receipt ledger inaccessible to public database roles", () => {
    const sql = migration();

    expect(sql).toContain(
      "revoke all on table private.v3_confirmation_operations\n  from public, anon, authenticated",
    );
    expect(sql).not.toContain(
      "grant select on table private.v3_confirmation_operations to anon",
    );
    expect(sql).not.toContain(
      "grant select on table private.v3_confirmation_operations to authenticated",
    );
  });

  it("turns every draft writer into a revision participant", () => {
    const sql = migration();

    expect(sql).toContain("add column if not exists v3_revision bigint not null default 0");
    expect(sql).toContain("create trigger v3_confirmation_draft_revision");
    expect(sql).toContain("before update of payload on public.submission_drafts");
    expect(sql).toContain("new.v3_revision := old.v3_revision + 1");
  });

  it("uses compare-and-swap draft writes and returns the server copy on conflict", () => {
    const sql = migration();

    expect(sql).toContain("for update");
    expect(sql).toContain("v_existing.v3_revision <> v_expected");
    expect(sql).toContain("'conflict', true");
    expect(sql).toContain("'payload', v_existing.payload");
    expect(sql).toContain("'revision', v_existing.v3_revision");
  });
});

describe("V3 Confirmation server adapter", () => {
  it("hashes the logical request on the server and excludes changing network metadata", () => {
    const source = serverFunctions();
    const hash = source.indexOf("sha256Hex(JSON.stringify(logicalPayload))");
    const clientIp = source.indexOf("client_ip: getClientIp()");

    expect(source).toContain("edit_token_hash: await sha256Hex(edit_token)");
    expect(hash).toBeGreaterThan(-1);
    expect(clientIp).toBeGreaterThan(hash);
  });

  it("requires a stable client idempotency key rather than inventing one after dispatch", () => {
    const source = serverFunctions();

    expect(source).toContain("idempotency_key: z.string().uuid()");
    expect(source).toContain("_idempotency_key: idempotency_key");
    expect(source).not.toContain("randomUUID");
  });

  it("never converts a post-commit projection failure into a false submission failure", () => {
    const source = serverFunctions();

    expect(source).toContain("if (!result.ok || !result.submission_id) return normalized");
    expect(source).toContain('normalized.canonical_sync = "pending"');
    expect(source).toContain("return normalized");
  });

  it("uses the public runtime client rather than privileged browser-accessible credentials", () => {
    const source = serverFunctions();

    expect(source).toContain("createConfirmationPublicRuntimeClient");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("*.supabase.co");
  });
});
