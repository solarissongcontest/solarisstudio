import { RULE_CHAPTER_GROUPS } from "@/lib/governance-v5";
import { SSC_RULE_CHAPTERS } from "@/lib/ssc-rules-v4";

export const RULE_CHAPTER_DIRECTORY_GROUPS = [
  ...RULE_CHAPTER_GROUPS,
  { title: "Worldbuilding", chapters: [22] },
] as const;

export type RuleChapterDirectoryGroupName = "all" | (typeof RULE_CHAPTER_DIRECTORY_GROUPS)[number]["title"];
export type RuleChapterDirectoryChapter = (typeof SSC_RULE_CHAPTERS)[number];

export type RuleChapterDirectoryGroup = {
  title: string;
  chapters: RuleChapterDirectoryChapter[];
};

/** Pure, published rulebook navigation. No competing rule versions or client authority. */
export function filterRuleChapterDirectory(
  search: string,
  group: string = "all",
): RuleChapterDirectoryGroup[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return RULE_CHAPTER_DIRECTORY_GROUPS
    .filter((entry) => group === "all" || entry.title === group)
    .map((entry) => ({
      title: entry.title,
      chapters: entry.chapters.flatMap((number) => {
        const chapter = SSC_RULE_CHAPTERS.find((item) => item.number === number);
        if (!chapter) return [];
        const searchable = [
          chapter.number,
          chapter.title,
          chapter.description,
          entry.title,
        ].join(" ").toLocaleLowerCase();
        return terms.every((term) => searchable.includes(term)) ? [chapter] : [];
      }),
    }))
    .filter((entry) => entry.chapters.length > 0);
}

export function countRuleChapters(groups: readonly RuleChapterDirectoryGroup[]): number {
  return groups.reduce((sum, group) => sum + group.chapters.length, 0);
}
