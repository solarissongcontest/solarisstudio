import {
  applyShowPublicationChange,
  loadShowPublicationControls,
  type ShowPublicationPreview,
  type ShowPublicationControl,
} from "./show-publication-lifecycle";
export type ReviewedEditionPublicationCommands = {
  editionId: string;
  commands: Array<{ preview: ShowPublicationPreview; operationId: string }>;
};
/** Replays the exact reviewed commands after an ambiguous partial batch. */
export async function applyReviewedEditionPublication(
  review: ReviewedEditionPublicationCommands,
  apply = applyShowPublicationChange,
  read: (editionId: string) => Promise<ReadonlyArray<Pick<ShowPublicationControl, "editionId" | "state">>> = loadShowPublicationControls,
) {
  // Validate the whole frozen batch before ANY mutation, not one row at a time.
  const showIds = new Set<string>();
  const operationIds = new Set<string>();
  for (const command of review.commands) {
    if (command.preview.editionId !== review.editionId || command.preview.targetState !== "hidden" ||
        !command.operationId || showIds.has(command.preview.showId) || operationIds.has(command.operationId)) {
      throw new Error("Reviewed publication command scope or identity is invalid.");
    }
    showIds.add(command.preview.showId);
    operationIds.add(command.operationId);
  }
  for (const command of review.commands) {
    await apply({ preview: command.preview, operationId: command.operationId, idempotencyKey: command.operationId });
  }
  const current = await read(review.editionId);
  if (current.some((control) => control.editionId !== review.editionId || control.state === "public" || control.state === "scheduled")) {
    throw new Error("Reviewed commands completed, but another publication is active. Refresh and prepare a fresh review.");
  }
}
