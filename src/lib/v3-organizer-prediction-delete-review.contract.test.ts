import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/predictions.tsx",
  "utf8",
);
const adapter = readFileSync(
  "src/integrations/v3/organizer-prediction-operations.ts",
  "utf8",
);
const wrapper = readFileSync(
  "src/lib/v3-organizer-prediction-operations.ts",
  "utf8",
);
const compatibility = readFileSync("src/lib/prediction-data.ts", "utf8");

describe("V3 Organizer Prediction draft deletion review", () => {
  it("previews the canonical round version before opening the destructive review", () => {
    const previewIndex = route.indexOf(
      "const preview = await previewPredictionRoundDelete(selectedRound.id);",
    );
    const openReviewIndex = route.indexOf("setPendingDeleteReview({");

    expect(previewIndex).toBeGreaterThan(-1);
    expect(openReviewIndex).toBeGreaterThan(previewIndex);
    expect(route).toContain("expectedRoundVersion: preview.roundVersion");
    expect(route).toContain(
      "roundFingerprint: predictionRoundFingerprint(selectedRound)",
    );
    expect(route).toContain(
      "idempotencyKey: `prediction-round-delete:${operationId}`",
    );
    expect(route).not.toContain("useDeletePredictionRound()");
  });

  it("fails closed if edition, show or reviewed round state drifts before apply", () => {
    const staleCheckIndex = route.indexOf(
      "predictionRoundFingerprint(selectedRound) !== pendingDeleteReview.roundFingerprint",
    );
    const applyIndex = route.indexOf(
      "await applyDelete.mutateAsync(pendingDeleteReview.operation)",
    );

    expect(route).toContain("editionId !== pendingDeleteReview.editionId");
    expect(route).toContain("selectedShow?.id !== pendingDeleteReview.showId");
    expect(route).toContain("selectedRound?.id !== pendingDeleteReview.roundId");
    expect(route).toContain(
      "selectedRound.status !== pendingDeleteReview.roundStatus",
    );
    expect(staleCheckIndex).toBeGreaterThan(-1);
    expect(applyIndex).toBeGreaterThan(staleCheckIndex);
    expect(route).toContain(
      "Prediction round state changed while deletion was being reviewed. Nothing was deleted; prepare a new review from the current draft.",
    );
  });

  it("applies the frozen version and operation identity through the existing canonical delete RPC", () => {
    expect(adapter).toContain('"studio2_prediction_round_delete_preview"');
    expect(adapter).toContain('"studio2_delete_prediction_round"');
    expect(adapter).toContain(
      "p_expected_round_version: review.expectedRoundVersion",
    );
    expect(adapter).toContain("p_operation_id: review.operationId");
    expect(adapter).toContain("p_idempotency_key: review.idempotencyKey");
    expect(wrapper).toContain("useApplyReviewedPredictionRoundDelete");
    expect(route).toContain(
      "await applyDelete.mutateAsync(pendingDeleteReview.operation)",
    );
  });

  it("keeps one reviewed delete identity available after an uncertain failure", () => {
    expect(route).toContain("data-v3-organizer-prediction-delete-review");
    expect(route).toContain('ReviewFact label="System revision"');
    expect(route).toContain("Consequence");
    expect(route).toContain(
      "The same reviewed operation remains open; do not start a second deletion identity.",
    );
    expect(route).toContain(
      "onClose={() => !applyDelete.isPending && setPendingDeleteReview(null)}",
    );
  });

  it("removes the compatibility delete helper from Organizer without deleting the compatibility surface itself", () => {
    expect(compatibility).toContain("export function useDeletePredictionRound()");
    expect(route).not.toContain("useDeletePredictionRound");
  });
});
