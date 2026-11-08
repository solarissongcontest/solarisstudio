/**
 * Browser section navigation may point at a parent page while a detail route
 * is currently open. Screen readers must not hear "current page" for a link
 * to a different URL; use "location" for the active section instead.
 *
 * Deliberately compares pathname only: a public section link's query string
 * may include harmless routing state while referring to the same page.
 */
export function resolveV3WebNavigationCurrent({
  active,
  pathname,
  target,
}: {
  active: boolean;
  pathname: string;
  target: string;
}): "page" | "location" | undefined {
  if (!active) return undefined;
  const normalize = (path: string) => path.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  return normalize(pathname) === normalize(target) ? "page" : "location";
}
