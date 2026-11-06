/**
 * Ordinary production cannot access /v3-preview: its route redirects before
 * rendering. Only substitute a zero-dependency component in that exact case.
 * Dev previews and explicitly enabled production previews retain the real UI.
 */
export function shouldOmitDisabledV3Preview(
  isProduction: boolean,
  previewFlag: string | undefined,
): boolean {
  return isProduction && previewFlag !== "1";
}
