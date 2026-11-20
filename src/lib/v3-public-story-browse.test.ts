import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canExpandPublicStoryBatch,
  canExpandPublishedStorySearch,
  nextPublicStoryBatchLimit,
  publicStoryBatchAtServerCap,
  PUBLIC_STORY_BATCH_STEP,
  PUBLIC_STORY_INITIAL_BATCH,
  PUBLIC_STORY_RPC_MAX,
} from "./v3-public-story-browse";

describe("Bounded public Stories archive pagination", () => {
  it("loads one finite additional batch only after visitor action", () => {
    expect(PUBLIC_STORY_INITIAL_BATCH).toBe(30);
    expect(PUBLIC_STORY_BATCH_STEP).toBe(30);
    expect(PUBLIC_STORY_RPC_MAX).toBe(100);
    expect([30, 60, 90, 100].map(nextPublicStoryBatchLimit))
      .toEqual([60, 90, 100, 100]);
  });

  it("does not offer more for incomplete or capped published batches", () => {
    expect(canExpandPublicStoryBatch(0, 30)).toBe(false);
    expect(canExpandPublicStoryBatch(12, 30)).toBe(false);
    expect(canExpandPublicStoryBatch(30, 30)).toBe(true);
    expect(canExpandPublicStoryBatch(60, 60)).toBe(true);
    expect(canExpandPublicStoryBatch(100, 100)).toBe(false);
    expect(nextPublicStoryBatchLimit(Number.NaN)).toBe(30);
    expect(nextPublicStoryBatchLimit(-5)).toBe(30);
  });

  it("never claims a finite local query searched the entire historical collection", () => {
    expect(canExpandPublishedStorySearch("  SSC  ", 30, 30)).toBe(true);
    expect(canExpandPublishedStorySearch("", 30, 30)).toBe(false);
    expect(canExpandPublishedStorySearch("SSC", 19, 30)).toBe(false);
    expect(canExpandPublishedStorySearch("SSC", 100, 100)).toBe(false);
    expect(publicStoryBatchAtServerCap(100, 100)).toBe(true);
    expect(publicStoryBatchAtServerCap(99, 100)).toBe(false);
    expect(publicStoryBatchAtServerCap(100, 90)).toBe(false);
  });

  it("uses only existing public Storytelling RPC and preserves explicit loading/error states", () => {
    const route = readFileSync("src/routes/stories/index.tsx", "utf8");
    const api = readFileSync("src/lib/studio2-storytelling.ts", "utf8");
    const sql = readFileSync("supabase/migrations/20260912194100_studio2_storytelling_anniversary.sql", "utf8");
    expect(route).toContain("queryKey: ['public-storylines', storyLimit]");
    expect(route).toContain("queryFn: () => loadPublicStorylines(storyLimit)");
    expect(route).toContain("placeholderData: (previous) => previous");
    expect(route).toContain("disabled={storiesQuery.isFetching}");
    expect(route).toContain("storiesQuery.isError ?");
    expect(route).toContain("Clear story search");
    expect(route).toContain("Search more published history");
    expect(route).toContain("setStoryLimit(PUBLIC_STORY_RPC_MAX)");
    expect(route).toContain("reachedStoryLimit");
    expect(route).toContain("Earlier history may exist beyond this archive search limit.");
    expect(route).toContain("Read this edition story");
    expect(api).toContain("rpc('studio2_public_storylines', { p_limit: limit })");
    expect(sql).toContain("limit greatest(1, least(coalesce(p_limit, 20), 100))");
    expect(route).not.toContain("useAllJuryVotes");
    expect(route).not.toContain("service_role");
  });
});
