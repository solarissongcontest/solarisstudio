import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../integrations/v3/results-source.server.ts", import.meta.url),
  "utf8",
);
const runtime = readFileSync(new URL("./v3-results-runtime.ts", import.meta.url), "utf8");
const gate = readFileSync(
  new URL("../components/v3/V3ResultsRootGate.tsx", import.meta.url),
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

  it("scopes larger reads to the selected result edition and show", () => {
    expect(source).toContain('.eq("show_id", latestShow.id)');
    expect(source).toContain('client.rpc("public_safe_participants"');
    expect(source).toContain("_edition_id: latestEdition.id");
    expect(source).toContain('.eq("edition_id", latestEdition.id)');
    expect(source).toContain('.in("id", [...countryIds])');
    expect(source).not.toContain("useAllResults");
    expect(source).not.toContain("useAllParticipants");
    expect(source).not.toContain("localStorage");
  });

  it("filters withdrawn and disqualified identities without deleting stored results", () => {
    expect(source).toContain('participant.participation_status === "withdrawn"');
    expect(source).toContain('participant.participation_status === "disqualified"');
    expect(source).toContain("filterNonCompetingRows");
  });

  it("keeps the V3 query bounded and non-polling", () => {
    expect(runtime).toContain('["v3-results-bundle"]');
    expect(runtime).toContain("staleTime: 60_000");
    expect(runtime).toContain("refetchOnWindowFocus: false");
    expect(runtime).toContain("retry: false");
    expect(runtime).not.toMatch(/setInterval|refetchInterval/);
  });

  it("gates installed V3 before the legacy archive hooks can mount", () => {
    const gateReturn = route.indexOf("return <V3ResultsRootGate");
    const legacyComponent = route.indexOf("function LegacyResultsOverviewPage");
    const archiveHook = route.indexOf("const editionsQuery = useEditions()");

    expect(gateReturn).toBeGreaterThan(-1);
    expect(legacyComponent).toBeGreaterThan(gateReturn);
    expect(archiveHook).toBeGreaterThan(legacyComponent);
    expect(gate).toContain("useV3ResultsBundle(true)");
    expect(gate).toContain("rollout.data.resultsEnabled === true");
    expect(gate).toContain("if (!v3Enabled) return <>{fallback}</>");
  });
});
