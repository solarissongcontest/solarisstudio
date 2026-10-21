import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/admin/predictions.tsx");
const operations = source("src/lib/v3-organizer-prediction-operations.ts");
const transport = source("src/integrations/v3/organizer-prediction-operations.ts");

describe("V3 Organizer Prediction Arena operation review", () => {
  it("reviews configuration instead of saving directly from form submit", () => {
    expect(route).toContain("<form onSubmit={reviewSave}");
    expect(route).toContain("setPendingSaveReview({");
    expect(route).toContain("Review prediction round");
    expect(route).toContain("confirmationText={pendingSaveReview?.showName}");
    expect(route).not.toContain("useSavePredictionRound");
  });

  it("freezes the canonical config preview revision and one operation identity", () => {
    expect(route).toContain("const preview = await previewPredictionRoundSave(form.showId)");
    expect(route).toContain("expectedRoundVersion: preview.roundVersion");
    expect(route).toContain("const operationId = crypto.randomUUID()");
    expect(route).toContain("idempotencyKey: `prediction-round-save:${operationId}`");
    expect(transport).toContain("p_expected_round_version: review.expectedRoundVersion");
    expect(transport).toContain("p_operation_id: review.operationId");
    expect(transport).toContain("p_idempotency_key: review.idempotencyKey");
  });

  it("keeps V3 review state transport-free and delegates canonical RPC access to the integration layer", () => {
    expect(operations).toContain('from "@/integrations/v3/organizer-prediction-operations"');
    expect(operations).not.toContain("integrations/supabase");
    expect(operations).not.toContain(".rpc(");
    expect(transport).toContain('from "@/integrations/supabase/client"');
  });

  it("does not re-preview after confirmation and sends the reviewed revision to the canonical save command", () => {
    expect(transport.match(/studio2_prediction_round_config_preview/g)?.length).toBe(1);
    expect(transport.match(/studio2_save_prediction_round/g)?.length).toBe(1);
    expect(route).toContain("await applyRound.mutateAsync(pendingSaveReview.operation)");
    expect(route).toContain("intervening round change conflicts instead of being silently overwritten");
  });

  it("reviews scoring and binds apply to the reviewed score revision", () => {
    expect(route).toContain("const preview = await previewPredictionScore(selectedRound.id)");
    expect(route).toContain("expectedScoreRevision: preview.scoreRevision");
    expect(route).toContain("idempotencyKey: `prediction-score:${operationId}`");
    expect(route).toContain("Review scoring");
    expect(route).toContain("confirmationText={pendingScoreReview?.showName}");
    expect(transport).toContain("p_expected_score_revision: review.expectedScoreRevision");
    expect(transport.match(/studio2_prediction_score_preview/g)?.length).toBe(1);
    expect(transport.match(/studio2_score_prediction_round/g)?.length).toBe(1);
  });

  it("fails closed when Organizer edition/show/round context drifts while a review is open", () => {
    expect(route).toContain("editionId !== pendingSaveReview.editionId");
    expect(route).toContain("selectedShow?.id !== pendingSaveReview.showId");
    expect(route).toContain("(selectedRound?.id ?? null) !== pendingSaveReview.existingRoundId");
    expect(route).toContain("selectedRound?.id !== pendingScoreReview.roundId");
    expect(route).toContain("selectedRound.status !== pendingScoreReview.roundStatus");
    expect(route).toContain("selectedRound.locks_at !== pendingScoreReview.locksAt");
  });

  it("refreshes prediction projections after both success and uncertain failure", () => {
    expect(operations.match(/onSettled: async \(\) =>/g)?.length).toBe(2);
    expect(operations.match(/invalidateQueries\(\{ queryKey: \["prediction-rounds"\] \}\)/g)?.length).toBe(2);
  });
});
