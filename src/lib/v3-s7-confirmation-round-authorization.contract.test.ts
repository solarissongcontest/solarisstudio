import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3AuthorizationRequirement } from "./v3-authorization-requirement-registry";

const roundOperations = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql",
  ),
  "utf8",
);
const submitAuthority = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261016193700_v3_entry_credits_contract.sql",
  ),
  "utf8",
);
const submitRuntime = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261015183100_v3_confirmation_submit_runtime_replay_restore.sql",
  ),
  "utf8",
);
const stage3 = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-stage-3-confirmations.sh"),
  "utf8",
);

function applyFunctionBody() {
  const marker = "create or replace function public.studio2_apply_confirmation_round_change(";
  const start = roundOperations.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = roundOperations.indexOf("\nrevoke all on function public.studio2_apply_confirmation_round_change", start);
  expect(end).toBeGreaterThan(start);
  return roundOperations.slice(start, end);
}

describe("System V3 S7 Confirmation authorization", () => {
  it("binds participant submit to its own exact boundary instead of inventing an Organizer capability", () => {
    expect(v3AuthorizationRequirement("confirmation.submit")).toMatchObject({
      ownerDomain: "confirmation",
      state: "verified",
      authorizationModel: "participant-boundary",
      requiredCapability: null,
      scope: "object",
      serverBoundary: "public.v3_submit_confirmation",
      serviceRoleAllowed: true,
    });
    expect(v3AuthorizationRequirement("confirmation.submit")?.objectResolution).toContain(
      "edit token -> submission -> same round",
    );
  });

  it("makes the V3 submit wrapper the only executable participant mutation boundary", () => {
    expect(submitAuthority).toContain("create or replace function public.v3_submit_confirmation(");
    expect(submitAuthority).toContain("v_payload_session <> _browser_session_id");
    expect(submitAuthority).toContain("v_existing.request_hash <> v_request_hash");
    expect(submitAuthority).toContain("v_existing.round_id <> v_round_id");
    expect(submitAuthority).toContain("v_existing.browser_session_id <> _browser_session_id");
    expect(submitRuntime).toContain("revoke all on function public.submit_confirmation(jsonb)");
    expect(submitRuntime).toContain("from public, anon, authenticated, service_role;");
    expect(submitRuntime).toContain(
      "has_function_privilege('anon', 'public.submit_confirmation(jsonb)', 'EXECUTE')",
    );
    expect(submitRuntime).toContain(
      "has_function_privilege('anon', 'public.v3_submit_confirmation(jsonb,uuid,text,text)', 'EXECUTE')",
    );
  });

  it("binds edit-token authority to the exact active submission in the same round", () => {
    expect(submitRuntime).toContain("where token_hash = payload ->> 'edit_token_hash'");
    expect(submitRuntime).toContain("and active = true");
    expect(submitRuntime).toContain("and (expires_at is null or expires_at > now())");
    expect(submitRuntime).toContain("existing.round_id <> r.id");
    expect(submitRuntime).toContain("existing.locked");
    expect(submitRuntime).toContain("'invalid_token'");
    expect(submitRuntime).toContain("not existing.editing_allowed");
    expect(submitRuntime).toContain("not coalesce(r.editing_enabled, true)");
  });

  it("binds open, close and grant-edit to the same exact-object capability boundary", () => {
    for (const command of [
      "confirmation.open",
      "confirmation.close",
      "confirmation.grant_edit",
    ]) {
      expect(v3AuthorizationRequirement(command)).toMatchObject({
        ownerDomain: "confirmation",
        state: "verified",
        authorizationModel: "capability",
        requiredCapability: "confirmation.manage",
        scope: "object",
        objectResolution: "round -> edition",
        serverBoundary: "public.studio2_apply_confirmation_round_change",
        serviceRoleAllowed: true,
      });
    }
  });

  it("resolves the authoritative edition from the round before checking capability", () => {
    const apply = applyFunctionBody();
    const loadRound = apply.indexOf("from public.submission_rounds round");
    const resolvedEdition = apply.indexOf("v_edition_id := v_round.edition_id;", loadRound);
    const capability = apply.indexOf(
      "studio2_access_allowed('confirmation.manage', v_edition_id, false)",
      resolvedEdition,
    );

    expect(loadRound).toBeGreaterThanOrEqual(0);
    expect(resolvedEdition).toBeGreaterThan(loadRound);
    expect(capability).toBeGreaterThan(resolvedEdition);
    expect(apply.slice(loadRound, capability)).toContain("Confirmation round not found");
    expect(apply.slice(loadRound, capability)).toContain("using errcode = 'P0002'");
  });

  it("fails closed on missing capability and stale optimistic-concurrency state", () => {
    const apply = applyFunctionBody();
    expect(apply).toContain("Missing Solaris capability: confirmation.manage");
    expect(apply).toContain("using errcode = '42501'");
    expect(apply).toContain("if p_expected_version <> v_current_version then");
    expect(apply).toContain("Confirmation round changed since this preview was loaded");
  });

  it("does not expose the governed round mutation boundary to anonymous callers", () => {
    expect(roundOperations).toContain(
      "revoke all on function public.studio2_apply_confirmation_round_change",
    );
    expect(roundOperations).toContain("from public, anon;");
    expect(roundOperations).toContain(
      "grant execute on function public.studio2_apply_confirmation_round_change",
    );
    expect(roundOperations).toContain("to authenticated, service_role;");
  });

  it("has isolated participant and Organizer lifecycle evidence", () => {
    expect(stage3).toContain("rpc_request \"$ANON_KEY\" v3_submit_confirmation");
    expect(stage3).toContain("confirmation submit $(printf '%02d' \"$i\") accepted");
    expect(stage3).toContain("apply_confirmation_round_change status '{\"status\":\"closed\"}'");
    expect(stage3).toContain("apply_confirmation_round_change status '{\"status\":\"open\"}'");
    expect(stage3).toContain("apply_confirmation_round_change editing '{\"editingEnabled\":false}'");
    expect(stage3).toContain("apply_confirmation_round_change editing '{\"editingEnabled\":true}'");
  });
});
