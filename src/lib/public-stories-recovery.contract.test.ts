import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync("src/routes/stories/index.tsx", "utf8");
const detailSource = readFileSync("src/routes/stories/$editionSlug.tsx", "utf8");

describe("public Stories error and recovery states", () => {
  it("distinguishes failed story archive reads from a genuinely empty published archive", () => {
    const errorIndex = indexSource.indexOf("storiesQuery.isError ?");
    const loadingIndex = indexSource.indexOf("storiesQuery.isLoading ?");
    const emptyIndex = indexSource.indexOf("No edition stories published yet");
    expect(errorIndex).toBeGreaterThan(-1);
    expect(loadingIndex).toBeGreaterThan(errorIndex);
    expect(emptyIndex).toBeGreaterThan(loadingIndex);
    expect(indexSource).toContain("onRetry={() => void storiesQuery.refetch()}");
    expect(indexSource).not.toContain("storiesQuery.isError && !storiesQuery.data");
  });

  it("fails closed on cached calendar data when the latest publication read fails", () => {
    expect(indexSource).toContain("anniversaryQuery.isError ?");
    expect(indexSource).toContain("onRetry={() => void anniversaryQuery.refetch()}");
    expect(indexSource).toContain("No published moments for today");
    // An old empty success must not be mistaken for a verified current empty
    // archive when the latest refresh failed.
    expect(indexSource).not.toContain("anniversaryQuery.isError && !anniversaryQuery.data");
  });

  it("offers actionable recovery for story details without exposing internal error messages", () => {
    const errorIndex = detailSource.indexOf("storyQuery.isError ?");
    const emptyIndex = detailSource.indexOf("No published story for this edition");
    expect(errorIndex).toBeGreaterThan(-1);
    expect(emptyIndex).toBeGreaterThan(errorIndex);
    expect(detailSource).toContain("onRetry={() => void storyQuery.refetch()}");
    expect(detailSource).not.toContain("errorText(storyQuery.error)");
  });

  it("uses deterministic Solaris chronology in the public detail timeline", () => {
    expect(detailSource).toContain("formatSolarisStoryDate(story.publishedAt)");
    expect(detailSource).toContain("formatSolarisStoryDate(item.occurredAt)");
    expect(detailSource).not.toContain("toLocaleDateString(undefined");
  });

  it("does not expose cached narratives after a failed publication refresh", () => {
    expect(indexSource).not.toContain("storiesQuery.isError && !stories.length");
    expect(indexSource).not.toContain("anniversaryQuery.isError && !anniversary?.onThisDay.length");
    expect(indexSource).toContain("!anniversaryQuery.isError && anniversary?.sscAnniversary");
    expect(detailSource).not.toContain("storyQuery.isError && !story");

    expect(indexSource.indexOf("anniversaryQuery.isError ?")).toBeLessThan(
      indexSource.indexOf("anniversary.onThisDay.slice(0, 6)"),
    );
    expect(indexSource.indexOf("storiesQuery.isError ?")).toBeLessThan(
      indexSource.indexOf("filteredStories.map((story)"),
    );
    expect(detailSource.indexOf("storyQuery.isError ?")).toBeLessThan(
      detailSource.indexOf("story.items.map((item, index)"),
    );
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
