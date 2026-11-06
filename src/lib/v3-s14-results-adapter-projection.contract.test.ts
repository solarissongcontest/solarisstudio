import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adapter = readFileSync(
  resolve(process.cwd(), "scripts/v3-s14-materialize-televote-results.ts"),
  "utf8",
);

describe("S14 Results adapter canonical Televote projection", () => {
  it("lets canonical publication own projection writes and verifies exact provenance afterwards", () => {
    const publish = adapter.indexOf('.update({ results_status: "published" })');
    const statusRead = adapter.indexOf('rpc(\n    "studio2_televote_projection_status"');

    expect(publish).toBeGreaterThanOrEqual(0);
    expect(statusRead).toBeGreaterThan(publish);
    expect(adapter).toContain('.from("televote_votes")');
    expect(adapter).toContain("canonical Televote projection does not match published round");
    expect(adapter).toContain("canonical Televote projection provenance mismatch");
    expect(adapter).toContain("status.managed !== true");
    expect(adapter).toContain('String(status.sourceType ?? "") !== "round"');
    expect(adapter).toContain("Number(status.sourceVersion ?? -1) !== version");
    expect(adapter).not.toContain("already has canonical Televote vote rows");
    expect(adapter).not.toContain('db.from("televote_votes").insert');
  });
});
