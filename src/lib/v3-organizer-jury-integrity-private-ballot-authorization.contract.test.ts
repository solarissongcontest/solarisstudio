import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(
  new URL("../integrations/jury-voting/jury-integrity-admin.server.ts", import.meta.url),
  "utf8",
);
const endpoint = readFileSync(
  new URL("../integrations/jury-voting/jury-integrity-admin.functions.ts", import.meta.url),
  "utf8",
);

const page = readFileSync(
  new URL("../routes/_authenticated/admin/jury-integrity.tsx", import.meta.url),
  "utf8",
);

describe("Organizer Jury Integrity protected ballot boundary", () => {
  it("requires an explicit valid edition before querying private evidence", () => {
    expect(endpoint).toContain("if (!UUID.test(editionId))");
    expect(server).toContain("if (!scopedEditionId) throw new Error");
    expect(server).toContain("if (!EDITION_UUID.test(scopedEditionId))");
  });

  it("resolves the exact edition capability set once and checks BOTH permissions before private reads", () => {
    const resolve = "getSolarisCapabilitiesServer(scopedEditionId)";
    const capabilities = '["integrity.read", "jury.ballots.read"]';
    expect(server).toContain(resolve);
    expect(server).toContain(capabilities);
    expect(server.match(/getSolarisCapabilitiesServer\(scopedEditionId\)/g)).toHaveLength(1);
    expect(server).toContain("!access.capabilities.includes(capability)");
    expect(server).not.toContain("requireSolarisCapabilityServer");
    expect(server.indexOf(resolve)).toBeLessThan(server.indexOf(capabilities));
    expect(server.indexOf(capabilities)).toBeLessThan(server.indexOf("const db = supabaseAdmin"));
    expect(server.indexOf(capabilities)).toBeLessThan(server.indexOf('.from("vote_preflight_checks")'));
  });

  it("does not silently discard the private evidence that justifies the extra permission", () => {
    expect(server).toContain("admin_evidence");
    expect(server).toContain('from "./jury-integrity-readback"');
    expect(server).toContain("numberValue, percentageValue, peerCountValue, proportionValue");
    expect(server).toContain("score: numberValue(item.score)");
    expect(server).toContain("risk: percentageValue(row.risk_score)");
    expect(server).toContain("confidence: percentageValue(row.confidence)");
    expect(server).toContain("relationshipRisk: percentageValue(row.relationship_risk)");
    expect(server).toContain("expectedNormalizedScore: proportionValue(item.expectedNormalizedScore)");
    expect(server).toContain("peerBallots: peerCountValue(evidence.peerBallots)");
    expect(server).toContain('.eq("canonical_edition_id", scopedEditionId)');
    expect(server).toContain('.eq("model_version", "jury-integrity-model-v5")');
    expect(server).toContain('.limit(1000)');
    expect(server).toContain('{ count: "exact" }');
    expect(server).toContain("assertCompleteJuryIntegrityReadback(exactCount, preflights.length)");
    expect(server.indexOf("assertCompleteJuryIntegrityReadback(exactCount, preflights.length)")).toBeLessThan(server.indexOf("const showIds"));
    expect(server).toContain("mismatchedPreflight");
    expect(server).toContain("assertJuryIntegrityV5Evidence(");
    expect(server.indexOf("assertJuryIntegrityV5Evidence(")).toBeLessThan(server.indexOf("const showIds"));
    expect(server).toContain("missingShow");
    expect(server).toContain("Jury integrity target evidence is missing a country identity");
    expect(server).toContain("targetIds.add(id)");
  });
  it("does not mislabel preflight records as submitted jury ballots", () => {
    expect(page).toContain('label="Integrity checks" value={query.data.stats.total}');
    expect(page).not.toContain('label="Checked ballots"');
    expect(server).toContain('from("vote_preflight_checks")');
  });

  it("renders failed authorized reads as errors with an explicit accessible retry", () => {
    expect(page).toContain('role="alert"');
    expect(page).toContain("No integrity conclusion can be drawn");
    expect(page).toContain("query.data && !query.error && !query.isLoading");
    expect(page).not.toContain("query.data?.stats.total ?? 0");
    expect(page).toContain("onClick={() => void query.refetch()}");
    expect(page).toContain("disabled={query.isFetching}");
    expect(page).toContain("aria-busy={query.isFetching}");
    expect(page).toContain("Retry integrity evidence");
    expect(page).toContain("Review pagination or service health before trusting risk totals");
  });

  it("allows authorized producers to expand all evidence targets without another backend read", () => {
    expect(page).toContain("const [showAllTargets, setShowAllTargets] = useState(false)");
    expect(page).toContain("rows={showAllTargets ? row.targets : row.targets.slice(0, 8)}");
    expect(page).toContain("row.targets.length > 8");
    expect(page).toContain("aria-expanded={showAllTargets}");
    expect(page).toContain("setShowAllTargets((current) => !current)");
    expect(page).toContain("Show all ${row.targets.length} scored targets");
    expect(page).toContain("Show top 8 targets");
  });

  it("bounds private evidence traffic and preserves an explicit operator refresh path", () => {
    expect(page).toContain("retry: false");
    expect(page).toContain("refetchOnWindowFocus: false");
    expect(page).toContain("refetchOnReconnect: false");
    expect(page).toContain("refetchInterval: false");
    expect(page).toContain("Refresh integrity evidence");
    expect(page).toContain("Retry integrity evidence");
    expect(page).toContain("onClick={() => void query.refetch()}");
    expect(page).toContain("disabled={query.isFetching}");
    expect(page).toContain("aria-busy={query.isFetching}");
  });

});
