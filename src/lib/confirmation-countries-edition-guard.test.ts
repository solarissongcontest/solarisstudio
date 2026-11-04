import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isConfirmationCountryBatchInEdition,
  isCurrentConfirmationCountriesRequest,
  latestParticipatingConfirmation,
} from "./confirmation-countries-edition-guard";

describe("Organizer country list exact-edition isolation", () => {
  it("accepts only the active Organizer edition and the exact load generation", () => {
    const request = { editionId: "edition-a", generation: 4 };
    expect(isCurrentConfirmationCountriesRequest(request, request)).toBe(true);
    expect(isCurrentConfirmationCountriesRequest(request, { editionId: "edition-b", generation: 4 })).toBe(false);
    expect(isCurrentConfirmationCountriesRequest(request, { editionId: "edition-a", generation: 6 })).toBe(false);
    expect(isCurrentConfirmationCountriesRequest({ editionId: "", generation: 4 }, { editionId: "", generation: 4 })).toBe(false);
    expect(isCurrentConfirmationCountriesRequest({ editionId: "edition-a", generation: -1 }, { editionId: "edition-a", generation: -1 })).toBe(false);
    expect(isCurrentConfirmationCountriesRequest({ editionId: "edition-a", generation: Number.NaN }, { editionId: "edition-a", generation: Number.NaN })).toBe(false);
  });

  it("refuses rows from a different edition or round rather than partially showing them", () => {
    const valid = { editions: { id: "edition-a" }, submission_rounds: { edition_id: "edition-a" } };
    expect(isConfirmationCountryBatchInEdition([valid], "edition-a")).toBe(true);
    expect(isConfirmationCountryBatchInEdition([{ ...valid, submission_rounds: null }], "edition-a")).toBe(true);
    expect(isConfirmationCountryBatchInEdition([valid, { ...valid, editions: { id: "edition-b" } }], "edition-a")).toBe(false);
    expect(isConfirmationCountryBatchInEdition([valid, { ...valid, submission_rounds: { edition_id: "edition-b" } }], "edition-a")).toBe(false);
    expect(isConfirmationCountryBatchInEdition([{ ...valid, editions: null }], "edition-a")).toBe(false);
    expect(isConfirmationCountryBatchInEdition([], "")).toBe(false);
  });

  it("does not resurrect participation when the latest submission withdraws", () => {
    const olderYes = { id: "older", participating: true };
    const latestNo = { id: "latest", participating: false };
    expect(latestParticipatingConfirmation([latestNo, olderYes])).toBeNull();
    expect(latestParticipatingConfirmation([olderYes, latestNo])).toEqual(olderYes);
    expect(latestParticipatingConfirmation([])).toBeNull();
  });

  it("hides private rows and text exports when the Organizer edition changes", () => {
    const source = readFileSync("src/routes/confirmations/admin/countries.tsx", "utf8");
    expect(source).toContain("isCurrentConfirmationCountriesRequest(request, {");
    expect(source).toContain("isConfirmationCountryBatchInEdition(batch.rows, selected)");
    expect(source).toContain("setLoadedScope(request);");
    expect(source).toContain("editionId === organizerEditionId");
    expect(source).toContain("isCurrentConfirmationCountriesRequest(loadedScope, {");
    expect(source).toContain("const scopedRows = useMemo(");
    expect(source).toContain("() => hasCurrentEditionData ? rows : []");
    expect(source).toContain("disabled={!hasCurrentEditionData || !participatingStatuses.length}");
    expect(source).toContain("if (!hasCurrentEditionData || !organizerEditionId || !text) return;");
    expect(source).toContain("setLoadedScope(null);");
  });

  it("uses the newest participation intent for badges and exports, with retry on failed reads", () => {
    const source = readFileSync("src/routes/confirmations/admin/countries.tsx", "utf8");
    expect(source).toContain("const latest = latestParticipatingConfirmation(list);");
    expect(source).toContain("const status = countryStatus(latest);");
    expect(source).not.toContain("list.find((row) => row.participating)");
    expect(source).toContain("setReloadNonce((value) => value + 1)");
    expect(source).toContain("onClick={() => void copy(participatingStatuses.map(");
  });

  it("keeps Delegations overview metrics and triage inside the loaded edition epoch", () => {
    const source = readFileSync("src/routes/confirmations/admin/index.tsx", "utf8");
    const scope = source.indexOf("const hasCurrentDelegationData = loadedScope !== null");
    const filtered = source.indexOf("const activeResponses = useMemo(", scope);
    const triage = source.indexOf("const triageCounts = useMemo(", filtered);
    expect(scope).toBeGreaterThanOrEqual(0);
    expect(filtered).toBeGreaterThan(scope);
    expect(triage).toBeGreaterThan(filtered);
    expect(source).toContain("generation: ++generationRef.current");
    expect(source).toContain("if (!isCurrent()) return;");
    expect(source).toContain("setLoadedScope(request);");
    expect(source).toContain("() => hasCurrentDelegationData");
    expect(source).toContain("responses.filter((response) => response.editions?.id === organizerEditionId)");
    expect(source).toContain("loading || (Boolean(activeEdition) && !hasCurrentDelegationData && !error)");
  });

  it("does not silently show empty or zero-status overview when the private read fails", () => {
    const source = readFileSync("src/routes/confirmations/admin/index.tsx", "utf8");
    expect(source).toContain("setLoadedScope(null);");
    expect(source).toContain("setResponses([]);");
    expect(source).toContain("setError(caught instanceof Error ? caught.message");
    expect(source).toContain("Retry delegation overview");
    expect(source).toContain("onClick={() => setReloadNonce((value) => value + 1)}");
  });
});
