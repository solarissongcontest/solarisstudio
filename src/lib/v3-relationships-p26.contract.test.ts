import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 P26 Relationships", () => {
  it("derives relationship analytics from the canonical public archive on the server", () => {
    const source = read("src/integrations/v3/relationships-source.server.ts");
    const functions = read("src/lib/v3-relationships.functions.ts");

    expect(functions).toContain('createServerFn({ method: "GET" })');
    expect(source).toContain("buildPublicCountryArchive");
    expect(source).toContain("computeRelationship");
    expect(source).toContain("computeCanonicalHeadToHead");
    expect(source).toContain("createConfirmationPublicRuntimeClient");
  });

  it("never feeds unpublished result or voting layers into relationship calculations", () => {
    const source = read("src/integrations/v3/relationships-source.server.ts");

    expect(source).toContain("resolveShowPublication(show).results === true");
    expect(source).toContain("snapshots.get(show.id)!.availability.detailedVoting");
    expect(source).toContain("snapshots.get(show.id)?.editionId === show.edition_id");
    expect(source).toContain("await loadPublicResultSnapshots(client, resultShowIds)");
    expect(source).toContain("snapshots.get(show.id)!.rows");
    expect(source).toContain('query.in("show_id", detailedShowIds)');
    expect(source).toContain("buildPublicCountryArchive({");
  });

  it("validates pair input and does not let the browser nominate archive authority", () => {
    const functions = read("src/lib/v3-relationships.functions.ts");
    const runtime = read("src/lib/v3-relationships-runtime.ts");

    expect(functions).toContain("pairSchema");
    expect(functions).toContain(".inputValidator(");
    expect(functions).toContain("loadV3RelationshipDetailBundle(data.pair)");
    expect(runtime).toContain("getV3RelationshipDetailBundle({ data: { pair: normalizedPair } })");
    expect(runtime).not.toContain("editionId");
    expect(runtime).not.toContain("showId");
  });

  it("keeps relationship projections read-only", () => {
    const combined = [
      read("src/integrations/v3/relationships-source.server.ts"),
      read("src/lib/v3-relationships.functions.ts"),
      read("src/lib/v3-relationships-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain(".insert(");
    expect(combined).not.toContain(".update(");
    expect(combined).not.toContain(".delete(");
    expect(combined).not.toContain(".upsert(");
    expect(combined).not.toContain("service_role");
  });

  it("moves both index and pair detail onto V3 only through Results rollout authority", () => {
    const gate = read("src/components/v3/V3RelationshipsGate.tsx");
    const indexRoute = read("src/routes/relationships/index.tsx");
    const detailRoute = read("src/routes/relationships/$pair.tsx");

    expect(gate).toContain("useV3EditionRolloutProbe");
    expect(gate).toContain("useV3RolloutProbe");
    expect(gate).toContain("resultsEnabled !== true");
    expect(gate).toContain("return <>{fallback}</>");
    expect(indexRoute).toContain("<V3RelationshipsIndexGate fallback={<LegacyRelationshipsPage />} />");
    expect(detailRoute).toContain("<V3RelationshipDetailGate");
    expect(detailRoute).toContain("fallback={<LegacyRelationshipPairPage pair={pair} />}");
  });

  it("preserves search, relationship categories and pair drill-down", () => {
    const index = read("src/components/v3/V3RelationshipsIndexScreen.tsx");
    const detail = read("src/components/v3/V3RelationshipDetailScreen.tsx");

    expect(index).toContain("Search a country");
    expect(index).toContain('value: "alliances"');
    expect(index).toContain('value: "rivalries"');
    expect(index).toContain('value: "one-sided"');
    expect(index).toContain('to="/relationships/$pair"');
    expect(detail).toContain("Support over time");
    expect(detail).toContain("Head-to-head");
    expect(detail).toContain("Relationship milestones");
    expect(detail).toContain('to="/countries/$code"');
    expect(detail).toContain('to="/editions/$slug"');
  });

  it("does not expose browser-controlled relationship rollout or raw archive hooks in V3", () => {
    const combined = [
      read("src/components/v3/V3RelationshipsGate.tsx"),
      read("src/components/v3/V3RelationshipsIndexScreen.tsx"),
      read("src/components/v3/V3RelationshipDetailScreen.tsx"),
      read("src/lib/v3-relationships-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain("localStorage");
    expect(combined).not.toContain("sessionStorage");
    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_RELATIONSHIPS");
    expect(combined).not.toContain("useAllJuryVotes");
    expect(combined).not.toContain("useAllResults");
    expect(combined).not.toContain("useAllParticipants");
  });
});
