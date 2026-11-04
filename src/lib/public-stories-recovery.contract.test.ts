import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync("src/routes/stories/index.tsx", "utf8");
const detailSource = readFileSync("src/routes/stories/$editionSlug.tsx", "utf8");

describe("public Stories error and recovery states", () => {
  it("distinguishes failed story archive reads from a genuinely empty published archive", () => {
    const errorIndex = indexSource.indexOf("storiesQuery.isError && !stories.length");
    const loadingIndex = indexSource.indexOf("storiesQuery.isLoading ?");
    const emptyIndex = indexSource.indexOf("No edition stories published yet");
    expect(errorIndex).toBeGreaterThan(-1);
    expect(loadingIndex).toBeGreaterThan(errorIndex);
    expect(emptyIndex).toBeGreaterThan(loadingIndex);
    expect(indexSource).toContain("onRetry={() => void storiesQuery.refetch()}");
    expect(indexSource).not.toContain("storiesQuery.isError && !storiesQuery.data");
  });

  it("handles calendar failures separately without hiding a previously cached calendar", () => {
    expect(indexSource).toContain("anniversaryQuery.isError && !anniversary?.onThisDay.length");
    expect(indexSource).toContain("onRetry={() => void anniversaryQuery.refetch()}");
    expect(indexSource).toContain("No published moments for today");
    // An old empty success must not be mistaken for a verified current empty
    // archive when the latest refresh failed.
    expect(indexSource).not.toContain("anniversaryQuery.isError && !anniversaryQuery.data");
  });

  it("offers actionable recovery for story details without exposing internal error messages", () => {
    const errorIndex = detailSource.indexOf("storyQuery.isError && !story");
    const emptyIndex = detailSource.indexOf("No published story for this edition");
    expect(errorIndex).toBeGreaterThan(-1);
    expect(emptyIndex).toBeGreaterThan(errorIndex);
    expect(detailSource).toContain("onRetry={() => void storyQuery.refetch()}");
    expect(detailSource).not.toContain("errorText(storyQuery.error)");
  });

  it("keeps both recovery controls usable with a keyboard and touch", () => {
    for (const source of [indexSource, detailSource]) {
      expect(source).toContain("type=\"button\"");
      expect(source).toContain("onClick={onRetry}");
      expect(source).toContain("min-h-11");
      expect(source).toContain("focus-visible:outline");
      expect(source).toContain("role={onRetry ? 'alert' : undefined}");
    }
  });
});
