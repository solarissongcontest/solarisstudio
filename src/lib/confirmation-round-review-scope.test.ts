import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isCurrentConfirmationRoundReview } from "./confirmation-round-review-scope";

describe("Organizer Confirmation round review context", () => {
  const request = { editionId: "edition-a", epoch: 4 };

  it("only accepts an exact current Organizer edition and preview scope", () => {
    const current = { editionId: "edition-a", organizerEditionId: "edition-a", epoch: 4 };
    expect(isCurrentConfirmationRoundReview(request, current, "edition-a")).toBe(true);
    expect(isCurrentConfirmationRoundReview(request, current, "edition-b")).toBe(false);
    expect(isCurrentConfirmationRoundReview(request, {
      ...current, organizerEditionId: "edition-b",
    })).toBe(false);
    expect(isCurrentConfirmationRoundReview(request, {
      ...current, editionId: "edition-b",
    })).toBe(false);
  });

  it("rejects A → B → A stale previews despite an identical edition id", () => {
    const returnedToA = { editionId: "edition-a", organizerEditionId: "edition-a", epoch: 6 };
    expect(isCurrentConfirmationRoundReview(request, returnedToA, "edition-a")).toBe(false);
    expect(isCurrentConfirmationRoundReview(
      { editionId: "edition-a", epoch: 6 }, returnedToA, "edition-a",
    )).toBe(true);
  });

  it("rejects unscoped requests and invalid epochs", () => {
    expect(isCurrentConfirmationRoundReview(
      { editionId: "", epoch: 0 },
      { editionId: "", organizerEditionId: "", epoch: 0 },
    )).toBe(false);
    expect(isCurrentConfirmationRoundReview(
      { editionId: "edition-a", epoch: -1 },
      { editionId: "edition-a", organizerEditionId: "edition-a", epoch: -1 },
    )).toBe(false);
  });

  it("checks server impact-preview edition before presenting an actionable review", () => {
    const route = readFileSync("src/routes/confirmations/admin/rounds.tsx", "utf8");
    expect(route).toContain("isCurrentConfirmationRoundReview(request, reviewScopeRef.current, preview.editionId)");
    expect(route).toContain("scopeEpoch: request.epoch");
    expect(route).toContain("open={Boolean(activePendingChange)}");
    expect(route).toContain("if (applyInFlightRef.current || !activePendingChange");
    expect(route).toContain("if (!isCurrentConfirmationRoundReview(request, reviewScopeRef.current))");
    expect(route).toContain("await applyConfirmationRoundChange({");
    expect(route).toContain("expectedVersion: pending.preview.expectedVersion");
    expect(route).toContain("idempotencyKey: pending.idempotencyKey");
  });

  it("does not allow an old request to unlock the new edition's in-flight preview", () => {
    const route = readFileSync("src/routes/confirmations/admin/rounds.tsx", "utf8");
    expect(route).toContain("previewInFlightRef.current === request.epoch");
    expect(route).toContain(
      "if (previewInFlightRef.current === request.epoch) previewInFlightRef.current = null;",
    );
    expect(route).toContain("reviewScopeRef.current.organizerEditionId,");
    expect(route).toContain("A round operation completed for a previous edition.");
  });
});
