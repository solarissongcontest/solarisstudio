import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const arena = readFileSync("src/routes/predictions/index.tsx", "utf8");
const detail = readFileSync("src/routes/predictions/$showId.tsx", "utf8");
const installed = readFileSync("src/components/v3/V3PredictionsRouteContent.tsx", "utf8");

describe("Public legacy Prediction Arena failure and recovery wiring", () => {
  it("renders round-query errors before the empty and unpublished fallbacks", () => {
    expect(arena).toContain("predictionReadStatus(roundsQuery)");
    expect(arena).toContain('readStatus === "error"');
    expect(arena).toContain('onClick={() => void roundsQuery.refetch()}');
    expect(arena.indexOf('readStatus === "error"')).toBeLessThan(
      arena.indexOf("roundData?.schemaReady === false"),
    );
    expect(arena.indexOf('readStatus === "error"')).toBeLessThan(
      arena.indexOf("rounds.length ?"),
    );
  });

  it("checks public round, fan session and saved entry before rendering an editable form", () => {
    expect(detail).toContain("round ? sessionQuery : undefined");
    expect(detail).toContain("round && user ? savedPredictionQuery : undefined");
    expect(detail).toContain('readStatus === "loading"');
    expect(detail).toContain('readStatus === "error"');
    expect(detail).toContain("savedPredictionQuery.refetch()");
    expect(detail.indexOf('readStatus === "error"')).toBeLessThan(
      detail.indexOf("<form onSubmit={submit}"),
    );
    expect(detail).toContain("Submission is paused until Solaris can verify");
  });
  it("offers a targeted retry instead of trapping installed viewers after private-state failures", () => {
    expect(installed).toContain('data-v3-predictions-private-state="error"');
    expect(installed).toContain("privateStateRetrying");
    expect(installed).toContain("if (session.isError) void session.refetch()");
    expect(installed).toContain("if (viewerId && history.isError) void history.refetch()");
    expect(installed).toContain("disabled={privateStateRetrying}");
    expect(installed).toContain("Retry prediction history");
  });
});
