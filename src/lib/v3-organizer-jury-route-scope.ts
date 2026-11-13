/** Resolve the exact edition segment from an Organizer Jury URL.
 * Nested Jury routes retain their parent edition identity. Malformed URL escapes
 * must fail closed instead of throwing during a protected route render.
 */
export function juryEditionSlugFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const juryIndex = segments.indexOf("jury");
  if (juryIndex < 0 || segments[juryIndex - 1] !== "admin") return null;
  const encoded = segments[juryIndex + 1];
  if (!encoded) return null;
  try {
    const slug = decodeURIComponent(encoded);
    return slug && !slug.includes("/") && !slug.includes("\\") ? slug : null;
  } catch {
    return null;
  }
}
