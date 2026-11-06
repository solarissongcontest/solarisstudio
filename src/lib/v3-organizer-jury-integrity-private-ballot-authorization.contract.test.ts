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
  });

  it("requires BOTH integrity and jury ballot read permission for the same selected edition", () => {
    const integrity = 'requireSolarisCapabilityServer("integrity.read", scopedEditionId)';
    const ballots = 'requireSolarisCapabilityServer("jury.ballots.read", scopedEditionId)';
    expect(server).toContain(integrity);
    expect(server).toContain(ballots);
    expect(server.indexOf(integrity)).toBeLessThan(server.indexOf(ballots));
    expect(server.indexOf(ballots)).toBeLessThan(server.indexOf('const db = supabaseAdmin'));
    expect(server.indexOf(ballots)).toBeLessThan(server.indexOf('.from("vote_preflight_checks")'));
  });

  it("does not silently discard the private evidence that justifies the extra permission", () => {
    expect(server).toContain("admin_evidence");
    expect(server).toContain("score: numberValue(item.score)");
    expect(server).toContain('.eq("canonical_edition_id", scopedEditionId)');
    expect(server).toContain('.eq("model_version", "jury-integrity-model-v5")');
    expect(server).toContain('.limit(1000)');
    expect(server).toContain("mismatchedPreflight");
    expect(server).toContain("missingShow");
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
  });

});
