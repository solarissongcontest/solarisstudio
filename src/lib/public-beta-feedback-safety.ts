export type BetaScreenshotValidationReason = "unsupported-type" | "empty" | "too-large";

/** Only local file validation may expose file-specific error copy. Backend,
 * storage and RLS errors cannot opt in by containing a familiar substring. */
export class BetaScreenshotValidationError extends Error {
  constructor(reason: BetaScreenshotValidationReason, filename: string) {
    const safeFilename = Array.from(filename, (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? " " : character).join("").slice(0, 160);
    const detail = {
      "unsupported-type": "is not a supported image type",
      empty: "is empty",
      "too-large": "is larger than 5 MB",
    }[reason];
    super(`Screenshot “${safeFilename}” ${detail}.`);
    this.name = "BetaScreenshotValidationError";
  }
}

/**
 * Beta feedback is a public, unauthenticated-facing surface. Backend, RLS,
 * storage and PostgREST error text must never be reflected back to the tester.
 * Only a locally constructed validation error is useful enough to expose;
 * everything else becomes stable product copy and preserves the local draft.
 */
export function publicBetaFeedbackErrorMessage(error: unknown) {
  if (error instanceof BetaScreenshotValidationError) return error.message;
  return "Your feedback was not submitted yet. Your draft is still saved on this device. Please try again later.";
}
