import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261014132819_v3_jury_reliability_foundation.sql",
  "utf8",
);
const boundary = readFileSync("src/lib/v3-jury.functions.ts", "utf8");
const server = readFileSync("src/integrations/v3/jury-actions.server.ts", "utf8");
const route = readFileSync("src/routes/jury-voting.tsx", "utf8");
const rollout = readFileSync("src/integrations/v3/rollout-probe.server.ts", "utf8");
const flagMigration = readFileSync(
  "supabase/migrations/20261014133955_v3_jury_rollout_flag.sql",
  "utf8",
);

describe("V3 Jury reliability foundation", () => {
  it("keeps drafts and operation receipts private", () => {
    expect(migration).toContain("create table if not exists private.v3_jury_drafts");
    expect(migration).toContain("create table if not exists private.v3_jury_operations");
    expect(migration).toContain(
      "revoke all on table private.v3_jury_drafts from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on table private.v3_jury_operations from public, anon, authenticated",
    );
    expect(migration).not.toContain("grant select on table private.v3_jury");
  });

  it("rejects stale draft writes and returns the newer canonical draft", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_existing.revision <> _expected_revision");
    expect(migration).toContain("'reason', 'stale_revision'");
    expect(migration).toContain("'payload', v_existing.payload");
    expect(migration).toContain("'server_revision', v_existing.revision");
    expect(migration).not.toContain("on conflict (show_id, user_id) do update");
  });

  it("adds idempotency around the existing canonical ballot writer", () => {
    expect(migration).toContain(
      "hashtextextended('v3-jury:' || _operation_id::text, 0)",
    );
    expect(migration).toContain(
      "v_ballot_id := public.submit_country_jury_ballot(_show_id, _entries, _preflight_id)",
    );
    expect(migration).toContain("v_existing.request_hash <> v_request_hash");
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("perform _request_hash");
    expect(migration).toContain("'replayed', true");
  });

  it("scopes reconciliation and receipts to the authenticated owner", () => {
    expect(migration).toContain("operation.user_id = auth.uid()");
    expect(migration).toContain("ballot.user_id = v_user_id");
    expect(migration).toContain("'authority', 'authoritative_server'");
    expect(migration).toContain("'request_hash', operation.request_hash");
    expect(migration).toContain("'state_version', operation.state_version");
  });

  it("reports legacy ballots without inventing receipt evidence", () => {
    const ballotLookup = migration.indexOf("select ballot.* into v_ballot");
    const legacyLookup = migration.indexOf("from public.jury_votes vote", ballotLookup);
    expect(migration).toContain("from public.jury_votes vote");
    expect(ballotLookup).toBeGreaterThan(-1);
    expect(legacyLookup).toBeGreaterThan(ballotLookup);
    expect(migration).toContain("'legacy', true");
    expect(migration).toContain("'submitted', true");
    expect(migration).toContain("'found', false");
  });

  it("exposes only bounded authenticated V3 RPCs", () => {
    for (const signature of [
      "public.v3_load_jury_draft(uuid)",
      "public.v3_save_jury_draft(uuid,jsonb,bigint,text,text)",
      "public.v3_submit_jury_ballot(uuid,jsonb,uuid,uuid,text)",
      "public.v3_reconcile_jury_submission(uuid)",
      "public.v3_jury_receipt(uuid)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public, anon`);
      expect(migration).toContain(`grant execute on function ${signature} to authenticated, service_role`);
    }
  });

  it("keeps participant writes behind an authenticated server boundary", () => {
    expect(server).toContain("getSolarisAccessTokenServer");
    expect(server).toContain("createSolarisAuthenticatedClientServer");
    expect(server).toContain('client.auth.getUser(token)');
    expect(server).toContain('authenticatedRpc("v3_save_jury_draft"');
    expect(server).toContain('authenticatedRpc("v3_submit_jury_ballot"');
    expect(server).toContain('authenticatedRpc("v3_reconcile_jury_submission"');
    expect(server).toContain('authenticatedRpc("v3_jury_receipt"');
    expect(server).not.toContain("supabaseAdmin");
    expect(server).not.toContain('.from("jury_votes")');
    expect(boundary).toContain('await import(\n      "@/integrations/v3/jury-actions.server"');
    expect(boundary).not.toContain("integrations/supabase");
  });

  it("does not trust a caller-selected request hash or malformed receipt", () => {
    expect(server).toContain("_request_hash: null");
    expect(server).toContain('receipt.authority !== "authoritative_server"');
    expect(server).toContain("Number.isSafeInteger(stateVersion)");
    expect(server).toContain("normalizeReceipt(result.receipt)");
  });

  it("submits only through the V3 command and reconciles an ambiguous response", () => {
    expect(route).toContain("useServerFn(submitV3JuryBallot)");
    expect(route).toContain("useServerFn(reconcileV3JurySubmission)");
    expect(route).toContain('"uncertain"');
    expect(route).toContain("Checking submission status…");
    expect(route).toContain("readV3JuryOperation(round.show_id)");
    expect(route).toContain("clearV3JuryOperation(round.show_id)");
    expect(route).not.toContain('supabase.rpc("submit_country_jury_ballot"');
  });

  it("loads and CAS-saves the canonical server draft when the draft rollout is enabled", () => {
    expect(route).toContain("useServerFn(loadV3JuryDraft)");
    expect(route).toContain("useServerFn(saveV3JuryDraft)");
    expect(route).toContain("expectedRevision");
    expect(route).toContain('data-v3-jury-draft="conflict"');
    expect(route).toContain("Use newer server draft");
    expect(route).toContain("Keep this device’s draft");
    expect(route).toContain("Saved on this device · reconnect to sync");
  });

  it("reloads authoritative receipts and labels legacy absence truthfully", () => {
    expect(route).toContain("useServerFn(lookupV3JuryReceipt)");
    expect(route).toContain('data-v3-jury-receipt="authoritative"');
    expect(route).toContain('data-v3-jury-receipt="legacy-unavailable"');
    expect(route).toContain("does not manufacture a receipt from browser state");
  });

  it("keeps draft/receipt rollout independently reversible without reintroducing a second ballot writer", () => {
    expect(flagMigration).toContain("'solaris_app_v3_jury'");
    expect(flagMigration).toContain("'solaris_app_v3_jury', false");
    expect(rollout).toContain('p_key: "solaris_app_v3_jury"');
    expect(route).toContain("rollout.data?.juryEnabled === true");
    expect(route).toContain("useServerFn(submitV3JuryBallot)");
    expect(route).not.toContain('supabase.rpc("submit_country_jury_ballot"');
  });
});
