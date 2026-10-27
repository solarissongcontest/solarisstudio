import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../integrations/v3/results-source.server.ts", import.meta.url),
  "utf8",
);
const serverFn = readFileSync(new URL("./v3-results.functions.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("./v3-results-runtime.ts", import.meta.url), "utf8");
const gate = readFileSync(
  new URL("../components/v3/V3ResultsRootGate.tsx", import.meta.url),
  "utf8",
);
const screen = readFileSync(
  new URL("../components/v3/V3ResultsScreen.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../routes/results/index.tsx", import.meta.url), "utf8");

describe("V3 Results root source contract", () => {
  it("uses the public server boundary and publication gates", () => {
    expect(source).toContain("createConfirmationPublicRuntimeClient");
    expect(source).toContain('.eq("published", true)');
    expect(source).toContain('.in("kind", ["grand-final", "final"])');
    expect(source).toContain("resolveShowPublication(show).results");
    expect(source).toContain("isShowPublic(show)");
  });

  it("treats browser show selection only as a server-revalidated nomination", () => {
    expect(serverFn).toContain("z.string().uuid().nullable().optional()");
    expect(serverFn).toContain("loadV3ResultsBundle(data.showId ?? null)");
    expect(source).toContain(
      "resultShows.find((show) => show.id === requestedShowId) ?? resultShows[0] ?? null",
    );
    expect(source).toContain("const options = resultShows.flatMap");
    expect(source).not.toContain("requestedShowId!");
  });

  it("scopes larger reads to exactly the selected public result edition and show", () => {
    expect(source).toContain("await loadPublicResultSnapshots(client, [selectedShow.id])");
    expect(source).toContain("snapshot.publicationVersion !== snapshots.get(selectedShow.id)!.publicationVersion");
    expect(source).toContain("snapshot.rows");
    expect(source).not.toContain('.from("results")');
    expect(source).toContain("snapshot?.editionId === show.edition_id");
    expect(source).toContain('.eq("edition_id", selectedEdition.id)');
    expect(source).toContain('.in("id", [...countryIds])');
    expect(source).not.toContain("useAllResults");
    expect(source).not.toContain("useAllParticipants");
    expect(source).not.toContain("localStorage");
  });

  it("retains canonical country identity separately from historical display identity", () => {
    expect(source).toContain("countryId: display.id");
    expect(source).toContain("canonicalCountryId: row.country_id");
  });

  it("keeps published eligibility frozen in the exact result version without deleting history", () => {
    expect(source).toContain("const rows = snapshot.rows");
    expect(source).not.toContain('client.rpc("public_safe_participants"');
    expect(source).not.toContain("filterNonCompetingRows");
    expect(source).not.toContain(".delete(");
  });

  it("keeps historical result queries bounded and non-polling", () => {
    expect(runtime).toContain('["v3-results-bundle", showId ?? "latest"]');
    expect(runtime).toContain("getV3ResultsBundle({ data: { showId } })");
    expect(runtime).toContain("staleTime: 60_000");
    expect(runtime).toContain("refetchOnWindowFocus: false");
    expect(runtime).toContain("refetchOnReconnect: true");
    expect(runtime).toContain("retry: false");
    expect(runtime).not.toMatch(/setInterval|refetchInterval/);
  });

  it("keeps history selection inside the existing Results rollout and spoiler gate", () => {
    expect(gate).toContain("useState<string | null>(null)");
    expect(gate).toContain("useV3ResultsBundle(selectedShowId, true)");
    expect(gate).toContain("rollout.data.resultsEnabled === true");
    expect(gate).toContain("resolveV3ResultsSpoilerProtection");
    expect(gate).toContain("onResultChange={setSelectedShowId}");
    expect(gate).toContain('bundle.data.input.showId || "none"');
    expect(gate).toContain(":${hideSpoilers}`}");
    expect(screen).toContain('data-v3-results-history=""');
    expect(screen).toContain("Only canonically published final results appear here");
  });

  it("personalizes only from the caller-scoped country account bound to the rollout viewer", () => {
    expect(gate).toContain("useMyCountryAccount()");
    expect(gate).toContain("countryAccount.data?.access.userId === rollout.data.userId");
    expect(gate).toContain("userDelegationCountryId: viewerCountryId");
    expect(screen).toContain('data-v3-your-result=""');
    expect(screen).toContain('title="Your delegation"');
    expect(source).not.toContain("country_accounts");
  });

  it("gates installed V3 before the legacy archive hooks can mount", () => {
    const gateReturn = route.indexOf("return <V3ResultsRootGate");
    const legacyComponent = route.indexOf("function LegacyResultsOverviewPage");
    const archiveHook = route.indexOf("const editionsQuery = useEditions()");

    expect(gateReturn).toBeGreaterThan(-1);
    expect(legacyComponent).toBeGreaterThan(gateReturn);
    expect(archiveHook).toBeGreaterThan(legacyComponent);
    expect(gate).toContain("useV3ResultsBundle(selectedShowId, true)");
    expect(gate).toContain("if (!v3Enabled) return <>{fallback}</>");
  });
});
