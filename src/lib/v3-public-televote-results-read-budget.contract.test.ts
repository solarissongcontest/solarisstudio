import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const server = source("src/integrations/televoting/results.server.ts");
const route = source("src/routes/televoting/results.tsx");

describe("V3 published Televote result read budget", () => {
  it("uses a projection-specific result selection instead of wildcard rows", () => {
    expect(server).toContain('from("round_results")');
    expect(server).toContain("publishedResultSelection(advanced, robust)");
    expect(server).toContain('"entry_key"');
    expect(server).toContain('"final_points"');
    expect(server).toContain('"original_votes"');
    expect(server).not.toContain('.select("*")');
  });

  it("polls only while waiting for first publication", () => {
    expect(route).toContain("staleTime: 60_000");
    expect(route).toContain(
      "refetchInterval: (query) => query.state.data?.round ? false : 60_000",
    );
    expect(route).toContain("refetchIntervalInBackground: false");
    expect(route).toContain("refetchOnWindowFocus: true");
    expect(route).not.toContain("refetchInterval: 60_000,");
  });
});
