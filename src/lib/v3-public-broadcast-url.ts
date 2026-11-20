/** Safely surface public broadcast links without treating content metadata as a
 * navigation authority. Reject script, inline-data, malformed and credentialed
 * URLs before they reach a browser link's href.
 */
export function publicBroadcastHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const raw = value.trim();
  if (!raw || /[\p{Cc}\s\\]/u.test(raw)) return null;

  try {
    const url = new URL(raw);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
