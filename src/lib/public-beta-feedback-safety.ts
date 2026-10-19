const PUBLIC_SCREENSHOT_ERROR_PATTERNS = [
  /not a supported image type/i,
  /screenshot .* is empty/i,
  /larger than 5 mb/i,
] as const;

/**
 * Beta feedback is a public, unauthenticated-facing surface. Backend, RLS,
 * storage and PostgREST error text must never be reflected back to the tester.
 * Only validation failures caused by the file they just selected are useful
 * enough to expose; everything else becomes stable product copy.
 */
export function publicBetaFeedbackErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (PUBLIC_SCREENSHOT_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return message;
  }

  return "Your feedback was not submitted yet. Your draft is still saved on this device. Please try again later.";
}
