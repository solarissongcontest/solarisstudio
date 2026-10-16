import {
  listStudio2MediaAssetReviews,
  type Studio2MediaAssetReview,
} from "@/lib/studio2-media-assets";

export type MediaReviewLoader = (
  editionId: string,
) => Promise<Studio2MediaAssetReview[]>;

export async function loadOrganizerMediaAssetReviews(
  editionId: string | null | undefined,
  loader: MediaReviewLoader = listStudio2MediaAssetReviews,
): Promise<Studio2MediaAssetReview[]> {
  const normalizedEditionId = editionId?.trim() ?? "";
  if (!normalizedEditionId) {
    throw new Error("Media Review requires an explicit edition scope.");
  }

  const reviews = await loader(normalizedEditionId);
  if (reviews.some((review) => review.editionId !== normalizedEditionId)) {
    throw new Error("Media Review returned data outside the selected edition scope.");
  }
  return reviews;
}
