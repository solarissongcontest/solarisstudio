import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/televoting/admin/combined.tsx", "utf8");
const functions = readFileSync("src/integrations/televoting/combined.functions.ts", "utf8");
const server = readFileSync("src/integrations/televoting/combined.server.ts", "utf8");

describe("Organizer Combined Results exact-edition private boundary", () => {
  it("remounts prepared result operations when actor or Organizer edition changes", () => {
    expect(source).toContain("component: CombinedResultsAccountBoundary");
    expect(source).toContain("const { editionId } = useAdminContext()");
    expect(source).toContain('<CombinedResultsPage key={`${actorId}:${editionId}`} editionId={editionId} />');
    expect(source).toContain("if (!editionId) {");
    expect(source).toContain("Select an edition in the Organizer toolbar");
  });

  it("keys protected queries to actor and exact edition, without automatic polling", () => {
    for (const key of [
      '["merged-televoting-admin", actorId]',
      '["merged-combined-aggregations", actorId, editionId]',
      '["merged-combined-edition-rounds", actorId, editionId]',
      '["merged-combined-detail", actorId, editionId, selectedId]',
    ]) expect(source).toContain(key);
    expect(source).toContain("enabled: Boolean(actorId)");
    expect(source).toContain("enabled: Boolean(actorId && admin && editionId)");
    expect(source).toContain("enabled: Boolean(actorId && admin && remoteEditionId && aggregations.some");
    for (const config of ["gcTime: 0", "retry: false", "refetchInterval: false", "refetchOnWindowFocus: false", "refetchOnReconnect: false"]) {
      expect(source.split(config).length - 1).toBe(4);
    }
  });

  it("uses read-only exact-edition rounds and forbids global sync and cross-edition editing", () => {
    expect(source).toContain("getMergedTelevotingRoundsPage");
    expect(source).toContain("roundsFn({ data: { editionId } })");
    expect(source).not.toContain("getMergedTelevotingRounds()");
    expect(source).toContain("aggregation.edition_id === remoteEditionId");
    expect(source).toContain("response.aggregation.edition_id !== remoteEditionId");
    expect(source).toContain("editionId: remoteEditionId");
    expect(source).toContain("if (!editionPage?.linked || !editionPage.edition)");
    expect(source).toContain("Legacy unassigned aggregates are not silently adopted.");
    expect(source).toContain("const selectedAggregationVerified = aggregations.some(");
    expect(source).toContain("if (selectedId && !selectedAggregationVerified)");
    expect(source).toContain("detail && selectedAggregationVerified ? (");
    expect(source).toContain("key={selectedId}");
  });

  it("bounds the privileged list at the server query, not just the displayed table", () => {
    expect(source).toContain("listFn({ data: { editionId } })");
    expect(functions).toContain('createServerFn({ method: "POST" })');
    expect(functions).toContain("Combined Results requires an exact Solaris edition");
    expect(functions).toContain("listMergedCombinedAggregationsServer(data.editionId)");
    expect(server).toContain('"admin_rounds_page_overview"');
    expect(server).toContain("p_solaris_edition_id: solarisEditionId");
    expect(server).toContain('if (payload.linked !== true) return [] as CombinedAggregation[];');
    expect(server).toContain('.eq("edition_id", remoteEditionId)');
    expect(server).toContain("requireMergedTelevotingAdminServer()");
  });

  it("fails closed on any protected administrative, round, aggregation or detail read", () => {
    expect(source).toContain('queryClient.invalidateQueries({ queryKey: ["merged-combined-aggregations", actorId, editionId] })');
    expect(source).toContain('queryClient.invalidateQueries({ queryKey: ["merged-combined-detail", actorId, editionId, selectedId] })');
    expect(source).toContain('queryClient.invalidateQueries({ queryKey: ["merged-televoting-audit", actorId] })');
    expect(source).toContain("const privateReadError = adminError ?? listError ?? roundsError ?? (selectedId ? detailError : null)");
    expect(source).toContain("if (privateReadError) {");
    expect(source).toContain("Verifying Combined Results…");
    expect(source).toContain("adminFetching || listLoading || listFetching");
    expect(source).toContain("roundsLoading || roundsFetching");
    expect(source).toContain("detailLoading || detailFetching");
    expect(source).toContain("adminError ? retryAdmin() : Promise.all([");
    expect(source).toContain("Retry Combined Results");
    expect(source).toContain("No calculation or publication action is available until it reloads.");
  });
});
