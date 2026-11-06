import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  applyReviewedPredictionRound,
  applyReviewedPredictionRoundDelete,
  applyReviewedPredictionScore,
  previewPredictionRoundDelete,
  previewPredictionRoundSave,
  previewPredictionScore,
  type PredictionRoundDeleteReview,
  type PredictionRoundSaveReview,
  type PredictionScoreReview,
} from "@/integrations/v3/organizer-prediction-operations";

export {
  previewPredictionRoundDelete,
  previewPredictionRoundSave,
  previewPredictionScore,
  type PredictionRoundDeleteReview,
  type PredictionRoundSaveReview,
  type PredictionScoreReview,
};

export function useApplyReviewedPredictionRound() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyReviewedPredictionRound,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prediction-rounds"] });
    },
  });
}

export function useApplyReviewedPredictionRoundDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyReviewedPredictionRoundDelete,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prediction-rounds"] });
    },
  });
}

export function useApplyReviewedPredictionScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyReviewedPredictionScore,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prediction-rounds"] }),
        queryClient.invalidateQueries({ queryKey: ["prediction-history"] }),
        queryClient.invalidateQueries({ queryKey: ["my-prediction"] }),
      ]);
    },
  });
}