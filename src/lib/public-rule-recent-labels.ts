import { getChapterBySlug, getRuleById } from "@/lib/ssc-rules/search";
import type { RulebookRelease } from "@/lib/ssc-rules/runtime-overlay";

type PublicRecent = { path: string; label: string };

/**
 * Never trust a cached recent rule title as canonical. Older browser history
 * may predate the current published regulation release.
 * The release snapshot wins; the bundled canon is the offline fallback.
 */
export function refreshPublicRuleRecentLabels<T extends PublicRecent>(
  recents: readonly T[],
  currentRelease?: RulebookRelease | null,
): T[] {
  const ruleTitles = new Map<string, string>();
  for (const change of currentRelease?.effective_changes ?? currentRelease?.changes ?? []) {
    const title = change.after_snapshot?.title?.trim();
    if (title && change.change_kind !== "removed") ruleTitles.set(change.rule_id, title);
  }

  return recents.flatMap((recent): T[] => {
    const chapterMatch = /^\/rules\/chapters\/([^/?#]+)\/?$/.exec(recent.path);
    if (chapterMatch) {
      const chapter = getChapterBySlug(chapterMatch[1]);
      return chapter
        ? [{ ...recent, label: `Chapter ${chapter.number}: ${chapter.title}` } as T]
        : [];
    }
    if (/^\/rules\/chapters\/?$/.test(recent.path)) {
      return [{ ...recent, label: "Rulebook Chapters" } as T];
    }
    const ruleMatch = /^\/rules\/(\d+\.\d+)\/?$/.exec(recent.path);
    if (!ruleMatch) return [recent];
    const rule = getRuleById(ruleMatch[1]);
    if (!rule) return [];
    return [{
      ...recent,
      label: `${rule.id} ${ruleTitles.get(rule.id) ?? rule.title}`,
    } as T];
  });
}
