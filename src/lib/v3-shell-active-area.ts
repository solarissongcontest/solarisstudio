import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";
import type { AppTabId } from "@/lib/app-navigation";

/**
 * Resolves the active V3 root tab from the same canonical screen registry that
 * owns route hierarchy/chrome. Search context matters for routes such as Show
 * pages opened from Results, so pathname-only area inference is insufficient.
 */
export function resolveV3ShellActiveArea(
  pathname: string,
  searchStr = "",
): AppTabId | null {
  const normalized = pathname.trim();
  if (!normalized.startsWith("/")) {
    throw new Error("V3 shell active-area resolution requires an absolute pathname");
  }

  const screen = resolveSolarisAppScreen(normalized, searchStr);
  if (screen.id === "fallback") return null;
  return screen.hierarchy.rootTab;
}
