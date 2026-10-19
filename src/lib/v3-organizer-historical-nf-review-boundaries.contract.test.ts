import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(process.cwd(), "src/components/HistoricalNationalFinalManager.tsx"),
  "utf8",
);

describe("V3 Organizer historical National Final consequence review", () => {
  it("routes public visibility changes through an explicit review instead of mutating from the list buttons", () => {
    expect(component).toContain("openPublicationReview");
    expect(component).toContain("Review publish line-up");
    expect(component).toContain("Review publish results");
    expect(component).toContain("Review hide line-up");
    expect(component).toContain("Review hide results");
    expect(component).not.toContain('onClick={() => void setPublication(nf, "lineup")}');
    expect(component).not.toContain('onClick={() => void setPublication(nf, "results")}');
  });

  it("requires typed confirmation before revealing songs/results or permanently deleting a manual final", () => {
    expect(component).toContain("reviewRequiresTyping");
    expect(component).toContain('pendingReview?.action === "publish_lineup"');
    expect(component).toContain('pendingReview?.action === "publish_results"');
    expect(component).toContain('pendingReview?.action === "delete"');
    expect(component).toContain("reviewConfirmation === pendingReview.name");
    expect(component).toContain("Type");
    expect(component).toContain("exactly to confirm");
    expect(component).not.toContain("window.confirm(");
  });

  it("rechecks live publication state and fails closed when the reviewed snapshot became stale", () => {
    expect(component).toContain("finalsQuery.refetch()");
    expect(component).toContain("live.lineup_published !== pendingReview.currentLineupPublished");
    expect(component).toContain("live.results_published !== pendingReview.currentResultsPublished");
    expect(component).toContain("Publication state changed while this review was open");
    expect(component).toContain("Reopen the review from the latest state");
  });

  it("shows exact before/after visibility and stays honest about the legacy authority boundary", () => {
    expect(component).toContain("National Final ID:");
    expect(component).toContain("Before");
    expect(component).toContain("After");
    expect(component).toContain("live refetch below is a client safety guard");
    expect(component).toContain("server-side version/CAS, idempotency or operation-receipt parity");
  });
});