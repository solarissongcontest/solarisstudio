import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/admin/televote/$slug.tsx"),
  "utf8",
);
const client = fs.readFileSync(
  path.join(process.cwd(), "src/lib/studio2-televote-aggregate.ts"),
  "utf8",
);

describe("Organizer Televote aggregate authority cutover", () => {
  it("removes direct browser mutation of canonical Televote totals", () => {
    expect(route).not.toContain('from("televote_votes")');
    expect(route).not.toContain(".update({ points:");
    expect(route).not.toContain("compatibility writer is still sequential");
    expect(route).toContain("applyTelevoteAggregateCommand");
  });

  it("binds review to the canonical version + state fingerprint before confirmation", () => {
    expect(route).toContain("getTelevoteAggregateSnapshot");
    expect(route).toContain("snapshot.resultsProtected");
    expect(route).toContain("snapshot.totals.map");
    expect(route).toContain("pendingReview.snapshot.version");
    expect(client).toContain("p_expected_version: input.snapshot.version");
    expect(client).toContain("p_expected_state_hash: input.snapshot.stateHash");
  });

  it("uses one stable operation identity and reconciles uncertain transport outcomes", () => {
    expect(client).toContain('command: "televote.aggregate.update"');
    expect(client).toContain("createSystemCommand");
    expect(client).toContain("p_operation_id: input.operationId");
    expect(client).toContain("p_idempotency_key: input.idempotencyKey");
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(client).toContain('receipt.status === "succeeded"');
    expect(client).toContain('receipt.status === "processing" || receipt.status === "uncertain"');
  });

  it("keeps sanctioned negative totals and exact participant identities", () => {
    expect(route).toContain("Negative totals are allowed for sanctions or point deductions");
    expect(route).toContain("participantId: participant.id");
    expect(route).toContain("participantId: change.participantId");
    expect(route).not.toContain("Math.max(0");
  });

  it("fails closed once Results owns corrections", () => {
    expect(route).toContain("These Televote totals are protected by the Results lifecycle");
    expect(route).toContain("Use the Results correction/republication lifecycle");
    expect(route).toContain("disabled={busy || !changes.length || publishedResults}");
  });
});
