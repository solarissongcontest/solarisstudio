import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import { GovernanceStatusStrip, SolarisDepthPage, SolarisDepthSafeZone } from "@/components/SolarisDepth";
import { V3DirectoryFamilyIndex, type V3DirectoryGroup } from "@/components/v3/V3DirectoryFamilyIndex";
import { filterRuleChapterDirectory } from "@/lib/v3-rule-chapter-directory";

export const Route = createFileRoute("/rules/chapters/")({
  head: () => ({
    meta: [
      { title: "Rulebook Chapters — Solaris Song Contest" },
      { name: "description", content: "Browse all 22 chapters of the official SSC General Regulations." },
    ],
  }),
  component: RuleChaptersPage,
});

// The directory is a view of the canonical rules, not another Rules authority.
const CHAPTER_GROUPS: V3DirectoryGroup[] = filterRuleChapterDirectory("").map((group) => ({
  id: group.title.toLowerCase().replace(/[^a-z]+/g, "-"),
  label: group.title,
  items: group.chapters.map((chapter) => ({
    id: String(chapter.number),
    title: `${chapter.number}. ${chapter.title}`,
    description: chapter.description,
    eyebrow: `${chapter.rules.length} official rules`,
    to: "/rules/chapters/$chapter",
    params: { chapter: chapter.slug },
    searchText: String(chapter.number),
  })),
}));

function RuleChaptersPage() {
  return (
    <RulesRouteShell resolvingTitle="Opening Rulebook chapters">
      <SolarisDepthPage tone="rules">
        <GovernanceStatusStrip context="rules" />
        <SolarisDepthSafeZone>
          <V3DirectoryFamilyIndex
            noShell
            title="22 chapters"
            eyebrow="OFFICIAL RULEBOOK"
            intro="Browse the official General Regulations by chapter or topic. The categories guide navigation, while official chapter numbering stays unchanged."
            browserIntro="Find an official chapter by topic, title or number. The General Regulations remain the authority."
            searchLabel="Search Rulebook chapters"
            searchPlaceholder="Search chapters by number or topic…"
            scopeLabel="All chapters"
            itemNoun="chapters"
            emptyText="Try another title or chapter number. The official Rulebook remains unchanged."
            groups={CHAPTER_GROUPS}
          />
          <Link to="/rules/search" search={{ q: "" }}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary">
            <Search size={18} aria-hidden="true" />
            Search full rule text
          </Link>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </RulesRouteShell>
  );
}
