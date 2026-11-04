import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const arena = readFileSync("src/routes/predictions/index.tsx", "utf8");
const detail = readFileSync("src/routes/predictions/$showId.tsx", "utf8");

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
});
