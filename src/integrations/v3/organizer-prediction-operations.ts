import { supabase } from "@/integrations/supabase/client";
import type { PredictionRound } from "@/lib/prediction-data";

type PredictionRoundWrite = Pick<
  PredictionRound,
  | "show_id"
  | "opens_at"
  | "locks_at"
  | "status"
  | "prediction_types"
  | "consensus_minimum"
>;

export type PredictionRoundSaveReview = PredictionRoundWrite & {
  expectedRoundVersion: number;
  operationId: string;
  idempotencyKey: string;
};

export type PredictionRoundDeleteReview = {
  roundId: string;
  expectedRoundVersion: number;
  operationId: string;
  idempotencyKey: string;
};

export type PredictionScoreReview = {
  roundId: string;
  expectedScoreRevision: number;
  operationId: string;
  idempotencyKey: string;
};

export async function previewPredictionRoundSave(showId: string) {
  const { data, error } = await (supabase as any).rpc(
    "studio2_prediction_round_config_preview",
    { p_show_id: showId },
  );
  if (error) throw error;
  return data as { roundVersion: number };
}

export async function previewPredictionRoundDelete(roundId: string) {
  const { data, error } = await (supabase as any).rpc(
    "studio2_prediction_round_delete_preview",
    { p_round_id: roundId },
  );
  if (error) throw error;
  return data as { roundVersion: number };
}

export async function previewPredictionScore(roundId: string) {
  const { data, error } = await (supabase as any).rpc("studio2_prediction_score_preview", {
    p_round_id: roundId,
  });
  if (error) throw error;
  return data as { scoreRevision: number };
}

export async function applyReviewedPredictionRound(review: PredictionRoundSaveReview) {
  const { data, error } = await (supabase as any).rpc("studio2_save_prediction_round", {
    p_show_id: review.show_id,
    p_opens_at: review.opens_at,
    p_locks_at: review.locks_at,
    p_status: review.status,
    p_prediction_types: review.prediction_types,
    p_consensus_minimum: review.consensus_minimum,
    p_operation_id: review.operationId,
    p_idempotency_key: review.idempotencyKey,
    p_expected_round_version: review.expectedRoundVersion,
  });
  if (error) throw error;
  return data;
}

export async function applyReviewedPredictionRoundDelete(review: PredictionRoundDeleteReview) {
  const { data, error } = await (supabase as any).rpc("studio2_delete_prediction_round", {
    p_round_id: review.roundId,
    p_operation_id: review.operationId,
    p_idempotency_key: review.idempotencyKey,
    p_expected_round_version: review.expectedRoundVersion,
  });
  if (error) throw error;
  return data;
}

export async function applyReviewedPredictionScore(review: PredictionScoreReview) {
  const { data, error } = await (supabase as any).rpc("studio2_score_prediction_round", {
    p_round_id: review.roundId,
    p_operation_id: review.operationId,
    p_idempotency_key: review.idempotencyKey,
    p_expected_score_revision: review.expectedScoreRevision,
  });
  if (error) throw error;
  return data as number;
}