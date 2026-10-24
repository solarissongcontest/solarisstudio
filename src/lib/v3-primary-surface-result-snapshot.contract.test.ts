import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const serverSource = source("src/integrations/v3/primary-surface-source.server.ts");
const primarySource = source("src/lib/v3-primary-surface-source.ts");
const contestState = source("src/lib/current-contest-state.ts");

describe("V3 primary surface published Result authority", () => {
  it("uses immutable published snapshots instead of mutable public.results rows", () => {
    expect(serverSource).toContain("loadV3PublishedResultSnapshot");
    expect(serverSource).toContain("loadPublishedResultEvidence");
    expect(serverSource).not.toContain('.from("results")');
    expect(serverSource).not.toContain("RESULT_COLUMNS");
    expect(serverSource).not.toContain("jury_points");
    expect(serverSource).not.toContain("televote_points");
    expect(serverSource).not.toContain("total_points");
  });

  it("carries only the result evidence Home actually consumes", () => {
    expect(contestState).toContain("export type PublicResultStateEvidence = Pick<");
    expect(contestState).toContain('"edition_id" | "show_id" | "final_rank"');
    expect(primarySource).toContain(
      "results: readonly PublicResultStateEvidence[]",
    );
    expect(primarySource).not.toContain("readonly ResultRow[]");
  });

  it("fails closed for hidden or historically unversioned snapshots", () => {
    expect(serverSource).toContain("if (!snapshot) return []");
    expect(serverSource).toContain("snapshot.edition.id !== editionId");
    expect(serverSource).toContain(
      "Published Result snapshot escaped the requested edition.",
    );
  });

  it("does not synthesize split-result values just to satisfy legacy ResultRow typing", () => {
    expect(serverSource).toContain("edition_id: snapshot.edition.id");
    expect(serverSource).toContain("show_id: snapshot.show.id");
    expect(serverSource).toContain("final_rank: row.finalRank");
    expect(serverSource).not.toContain("jury_points: 0");
    expect(serverSource).not.toContain("televote_points: 0");
    expect(serverSource).not.toContain("total_points: 0");
  });
});
