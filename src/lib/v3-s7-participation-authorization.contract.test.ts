import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3AuthorizationRequirement } from "./v3-authorization-requirement-registry";

const governed = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261003015000_organisation_os_v5_participation_status_operations.sql",
  ),
  "utf8",
);
const primitive = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260916035015_permission_engine_v2_operational_admin_rpc_cutover.sql",
  ),
  "utf8",
);
const stage4 = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-stage-4-entries.sh"),
  "utf8",
);

function functionBody(source: string, marker: string, revokeMarker: string) {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(revokeMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("System V3 S7 Participation authorization", () => {
  it("records participation.override as an edition-scoped capability mutation", () => {
    expect(v3AuthorizationRequirement("participation.override")).toMatchObject({
      ownerDomain: "participation",
      state: "verified",
      authorizationModel: "capability",
      requiredCapability: "entry.approve",
      scope: "edition",
      serverBoundary: "public.studio2_apply_participation_status",
      serviceRoleAllowed: true,
    });
    expect(v3AuthorizationRequirement("participation.override")?.objectResolution).toContain(
      "exactly one country or contest entity subject",
    );
  });

  it("fails closed before the governed R2 operation can target an invalid subject", () => {
    const apply = functionBody(
      governed,
      "create or replace function public.studio2_apply_participation_status(",
      "\nrevoke all on function public.studio2_apply_participation_status(",
    );

    expect(apply).toContain("if p_edition_id is null then");
    expect(apply).toContain("if p_status not in ('confirmed', 'withdrawn', 'disqualified') then");
    expect(apply).toContain("if (p_country_id is null) = (p_contest_entity_id is null) then");
    expect(apply).toContain(
      "studio2_access_allowed('entry.approve', p_edition_id, false)",
    );
    expect(apply).toContain("Missing Solaris capability: entry.approve");
  });

  it("binds idempotency, serialization and optimistic concurrency to the edition subject", () => {
    const apply = functionBody(
      governed,
      "create or replace function public.studio2_apply_participation_status(",
      "\nrevoke all on function public.studio2_apply_participation_status(",
    );

    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("'participation.status.' || p_status");
    expect(apply).toContain("'editionId', p_edition_id");
    expect(apply).toContain("'subjectKey', v_subject");
    expect(apply).toContain("pg_advisory_xact_lock(");
    expect(apply).toContain(
      "'studio2-participation-status:' || p_edition_id::text || ':' || v_subject",
    );
    expect(apply).toContain("if p_expected_version <> v_current_version then");
    expect(apply).toContain("Participation status changed since this preview was loaded");
  });

  it("keeps the retained primitive constrained to the same edition and subject", () => {
    const body = functionBody(
      primitive,
      "create or replace function public.admin_set_participation_status(",
      "\nrevoke all on function public.admin_set_participation_status(",
    );

    expect(body).toContain("studio2_access_allowed('entry.approve', _edition_id, true)");
    expect(body).toContain("update public.participants p");
    expect(body).toContain("where p.edition_id = _edition_id");
    expect(body).toContain("p.country_id = _country_id");
    expect(body).toContain("p.contest_entity_id = _contest_entity_id");
    expect(body).toContain("update public.entries");
    expect(body).toContain("where edition_id = _edition_id");
    expect(body).toContain("and country_id = _country_id");
  });

  it("exposes only the governed operation to browser organizers", () => {
    expect(governed).toContain(
      "revoke all on function public.studio2_apply_participation_status(\n  uuid, uuid, uuid, text, uuid, text, bigint\n) from public, anon;",
    );
    expect(governed).toContain(
      "grant execute on function public.studio2_apply_participation_status(\n  uuid, uuid, uuid, text, uuid, text, bigint\n) to authenticated, service_role;",
    );
    expect(governed).toContain(
      "revoke execute on function public.admin_set_participation_status(\n  uuid, uuid, uuid, text\n) from authenticated;",
    );
  });

  it("has an end-to-end governed withdrawal rehearsal with canonical-state verification", () => {
    expect(stage4).toContain("studio2_participation_status_change_preview");
    expect(stage4).toContain("studio2_apply_participation_status");
    expect(stage4).toContain("governed withdrawal reconciliation");
    expect(stage4).toContain("governed withdrawal status");
    expect(stage4).toContain("withdrawal left confirmed show-specific participant state");
  });
});
