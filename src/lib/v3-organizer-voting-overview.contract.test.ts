import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20261020002500_v3_o7_organizer_voting_overview.sql",
);
const server = source("src/integrations/televoting/admin-data.functions.ts");
const votingOverview = source("src/routes/televoting/admin/index.tsx");

describe("V3 Organizer Voting overview", () => {
  it("registers an additive S13 projection migration", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain("'v3.o7.organizer-voting-overview'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("requires one explicit authorized Organizer edition with no newest-edition fallback", () => {
    expect(migration).toContain("Explicit Organizer edition is required");
    expect(migration).toContain(
      "studio2_access_allowed('voting.read', p_edition_id, true)",
    );
    expect(migration).toContain("where edition.id = p_edition_id");
    expect(migration).not.toContain("order by edition_number desc");
    expect(votingOverview).toContain("enabled: Boolean(editionId)");
    expect(votingOverview).toContain(
      'queryKey: ["merged-televoting-admin-overview", editionId ?? "none"]',
    );
    expect(votingOverview).toContain("editionId: editionId!");
    expect(votingOverview).toContain("will not substitute a globally active or newest edition");
  });

  it("projects Jury from canonical voter, ballot, DNV and window state", () => {
    expect(migration).toContain("from public.voters voter");
    expect(migration).toContain("from public.jury_ballot_submissions ballot");
    expect(migration).toContain("from public.jury_ballot_statuses status_row");
    expect(migration).toContain("public.jury_voting_windows window");
    for (const field of [
      "'expected'",
      "'submitted'",
      "'valid'",
      "'needsReview'",
      "'invalidated'",
      "'superseded'",
      "'didNotVote'",
      "'missing'",
    ]) {
      expect(migration).toContain(field);
    }
  });

  it("does not manufacture Jury readiness from missing configuration", () => {
    expect(migration).toContain("when v_show_count = 0 then 'not_configured'");
    expect(migration).toContain(
      "when v_configured_show_count = 0 then 'not_configured'",
    );
    expect(votingOverview).toContain(
      "Missing data is never treated as a healthy Jury state",
    );
    expect(votingOverview).toContain("No shows exist in the selected edition");
  });

  it("keeps per-show Jury state bounded while edition totals remain complete", () => {
    expect(migration).toContain("limit 64");
    expect(migration).toContain("'showSummaryLimit', 64");
    expect(migration).toContain("'showSummaryTruncated', v_show_count > 64");
    expect(votingOverview).toContain("Edition totals above include every show");
  });

  it("reuses Televote authority and references Results rather than recalculating either", () => {
    expect(migration).toContain("televoting.admin_overview_summary(p_edition_id)");
    expect(migration).toContain("'authority', 'organizer-results-projection'");
    expect(migration).toContain("'route', '/admin/results'");
    expect(migration).not.toContain("from public.results");
    expect(migration).not.toContain("from public.televote_votes");
  });

  it("returns deterministic reconciliation identity without server time inside the fingerprint", () => {
    const core = migration.indexOf("v_core := jsonb_build_object(");
    const digest = migration.indexOf(
      "extensions.digest(convert_to(v_core::text",
      core,
    );
    const returnWithTime = migration.indexOf("'serverTime', now()", digest);
    expect(core).toBeGreaterThan(-1);
    expect(digest).toBeGreaterThan(core);
    expect(returnWithTime).toBeGreaterThan(digest);
    expect(migration).toContain("'stateVersion', v_state_version");
  });

  it("keeps the actor-bound projection inaccessible to anonymous and service-role browser callers", () => {
    expect(migration).toContain(
      "from public, anon, service_role;\ngrant execute on function public.studio2_organizer_voting_overview(uuid)",
    );
    expect(migration).toContain("to authenticated;");
  });

  it("cuts the server consumer to one canonical projection and validates returned scope", () => {
    expect(server).toContain('"studio2_organizer_voting_overview"');
    expect(server).toContain("editionId !== expectedEditionId");
    expect(server).toContain("stateVersion");
    expect(server).toContain("serverTime");
    expect(server).not.toContain('client.rpc(\n      "admin_overview_summary"');
  });

  it("renders Jury, Televote, Integrity and Results from the projection without direct table/RPC ownership", () => {
    expect(votingOverview).not.toContain("integrations/supabase/client");
    expect(votingOverview).not.toContain(".from(");
    expect(votingOverview).not.toContain(".rpc(");
    expect(votingOverview).toContain("data.jury.expected");
    expect(votingOverview).toContain("data.televote.submissions");
    expect(votingOverview).toContain("data.integrity.outstanding");
    expect(votingOverview).toContain("data.recommendedAction");
    expect(votingOverview).toContain("data.results.note");
    expect(votingOverview).toContain('/televoting/admin/rounds');
    expect(votingOverview).toContain('/televoting/admin/integrity');
  });

  it("surfaces Voting rules as core work only for the exact resolved edition slug", () => {
    expect(votingOverview).toContain('title="Voting rules"');
    expect(votingOverview).toContain('to={`/admin/voting-system/${editionSlug}`}');
    expect(votingOverview).toContain(
      "Voting rules become available after the selected edition identity has resolved.",
    );
    expect(votingOverview).toContain("Solaris will not guess an edition slug.");
  });
});
