import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018203000_v3_combined_results_read_authority.sql",
  ),
  "utf8",
);

function functionBody(name: string, nextMarker = "create or replace function") {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf(nextMarker, start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 exact-edition Combined Results read authority", () => {
  it("maps the reviewed Solaris edition through the canonical Televoting edition link", () => {
    const body = functionBody("private.v3_combined_remote_edition");
    expect(body).toContain("from public.integration_links link");
    expect(body).toContain("link.service = 'televoting'");
    expect(body).toContain("link.entity_type = 'edition'");
    expect(body).toContain("link.solaris_id = p_edition_id");
    expect(body).toContain("link.sync_status = 'linked'");
    expect(body).not.toMatch(/order by[\s\S]*limit 1/i);
  });

  it("authorizes the exact Solaris edition on the server and denies anonymous access", () => {
    const body = functionBody("private.v3_require_combined_results_read");
    expect(body).toContain("private.studio2_request_is_service_role()");
    expect(body).toContain("auth.uid() is null");
    expect(body).toContain("studio2_access_allowed('voting.read', p_edition_id, false)");
    expect(body).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(migration).toContain(
      "revoke all on function public.v3_combined_results_for_edition(uuid)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_combined_results_for_edition(uuid)\n  to authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.v3_combined_result_detail(uuid, uuid)\n  from public, anon;",
    );
  });

  it("keeps list and detail reads observational", () => {
    const list = functionBody("public.v3_combined_results_for_edition");
    const detail = functionBody("public.v3_combined_result_detail", "notify pgrst");
    for (const body of [list, detail]) {
      expect(body).toContain("stable");
      expect(body).not.toMatch(/\binsert\s+into\b/i);
      expect(body).not.toMatch(/\bupdate\s+[a-z0-9_.\"]+\s+set\b/i);
      expect(body).not.toMatch(/\bdelete\s+from\b/i);
      expect(body).not.toContain("syncEditableCombinedParticipantsFromSolarisServer");
      expect(body).not.toContain("v3_sync_published_televote_aggregation(");
    }
  });

  it("reports canonical participant binding state without repairing it", () => {
    const body = functionBody("private.v3_combined_participant_binding_state");
    expect(body).toContain("from televoting.televote_aggregation_sources source");
    expect(body).toContain("left join public.televoting_round_bindings binding");
    expect(body).toContain("binding.edition_id = p_edition_id");
    expect(body).toContain("from public.participants participant");
    expect(body).toContain("from televoting.televote_aggregation_participants participant");
    expect(body).toContain("'up_to_date'");
    expect(body).toContain("'drift'");
    expect(body).toContain("'custom'");
    expect(body).toContain("'ambiguous_source'");
    expect(body).not.toMatch(/\binsert\s+into\b/i);
    expect(body).not.toMatch(/\bupdate\b/i);
    expect(body).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("filters aggregations by the exact linked remote edition rather than global ordering", () => {
    const body = functionBody("public.v3_combined_results_for_edition");
    expect(body).toContain("aggregation.edition_id = v_remote_edition_id");
    expect(body).toContain("'linkState', 'unlinked'");
    expect(body).toContain("'serverTime', now()");
    expect(body).not.toContain("current edition");
    expect(body).not.toContain("newest");
    expect(body).not.toMatch(/\.limit\s*\(\s*1\s*\)/);
  });

  it("surfaces source scope evidence and the merged S14 Solaris projection state", () => {
    const body = functionBody("public.v3_combined_results_for_edition");
    expect(body).toContain("private.v3_televote_result_projection_sources projection");
    expect(body).toContain("projection.source_type = 'combined'");
    expect(body).toContain("projection.source_id = aggregation.id::text");
    expect(body).toContain("'scopeMismatchCount'");
    expect(body).toContain("'exactEditionBoundSourceCount'");
    expect(body).toContain("'participant_drift'");
    expect(body).toContain("'missing_projection'");
    expect(body).toContain("'stale_projection'");
    expect(body).toContain("'in_sync'");
  });

  it("requires edition plus aggregation identity for detail and rejects cross-edition objects", () => {
    const body = functionBody("public.v3_combined_result_detail", "notify pgrst");
    expect(body).toContain("p_edition_id uuid");
    expect(body).toContain("p_aggregation_id uuid");
    expect(body).toContain("public.v3_combined_results_for_edition(p_edition_id)");
    expect(body).toContain("Combined result is outside the reviewed Organizer edition");
    expect(body).toContain("using errcode = '42501'");
    expect(body).toContain("'sourceSolarisEditionId', round_binding.edition_id");
    expect(body).toContain("'scopeState'");
    expect(body).toContain("'wrong_edition'");
  });

  it("does not invent config/state CAS versions that the legacy model does not yet have", () => {
    expect(migration).toContain("'configVersion', null");
    expect(migration).toContain("'stateVersion', null");
    expect(migration).toContain(
      "'missingVersionContracts', jsonb_build_array('configVersion', 'stateVersion')",
    );
    expect(migration).toContain("'calculationVersion'");
  });

  it("is transactional and reloads PostgREST schema metadata", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});