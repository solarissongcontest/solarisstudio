import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readback = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/conversion-readback.server.ts"),
  "utf8",
);
const functions = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/conversion.functions.ts"),
  "utf8",
);
const resultsView = readFileSync(
  resolve(process.cwd(), "src/components/televoting/VotingResultsView.tsx"),
  "utf8",
);

describe("S14 Grand Final result calculation readback", () => {
  it("requires the authenticated mutation boundary to prove canonical committed state", () => {
    expect(readback).toContain("getMergedTelevoteConversionServer(roundId)");
    expect(readback).toContain("state.round.calculation_version !== expectedVersion");
    expect(readback).toContain('state.round.results_status !== "calculated"');
    expect(readback).toContain("state.round.results_outdated");
    expect(readback).toContain("state.stored.length !== state.participants.length");
    expect(readback).toContain("Calculation readback contains rows from another version");
  });

  it("reconciles only the explicit post-commit scalar-return ambiguity", () => {
    expect(readback).toContain(
      'message.startsWith("Calculation commit returned unexpected version")',
    );
    expect(readback).toContain("reconciledAfterUncertainOutcome: true");
    expect(readback).toContain("throw caught");
  });

  it("routes the server action through the readback contract", () => {
    expect(functions).toContain("runMergedOfficialCalculationWithReadbackServer");
    expect(functions).not.toContain("return runMergedOfficialCalculationServer(data.roundId)");
  });

  it("installs returned canonical state before invalidating/refetching", () => {
    const cacheWrite = resultsView.indexOf(
      "queryClient.setQueryData(conversionQueryKey, result.state)",
    );
    const refetch = resultsView.indexOf("await invalidate();", cacheWrite);
    expect(cacheWrite).toBeGreaterThanOrEqual(0);
    expect(refetch).toBeGreaterThan(cacheWrite);
  });

  it("does not weaken the Lock official result gate", () => {
    expect(resultsView).toContain(
      "current.round.calculation_version <= 0 || current.round.results_outdated || !storedRows.length",
    );
    expect(resultsView).toContain("Lock official result");
  });
});
