import { createFileRoute } from "@tanstack/react-router";

import { V3DirectoryFamilyIndex, type V3DirectoryGroup } from "@/components/v3/V3DirectoryFamilyIndex";
import { PUBLIC_TOOL_GROUPS } from "@/lib/v3-tool-directory";

export const Route = createFileRoute("/tools/")({
  head: () => ({
    meta: [
      { title: "Tools — Solaris Studio" },
      { name: "description", content: "Browse Solaris result, prediction, comparison and archive tools." },
    ],
  }),
  component: ToolsPage,
});

const GROUPS: V3DirectoryGroup[] = PUBLIC_TOOL_GROUPS.map((group) => ({
  id: group.id,
  label: group.title,
  items: group.tools.map((tool) => ({
    id: tool.to,
    title: tool.title,
    description: tool.description,
    to: tool.to,
    eyebrow: tool.eyebrow,
  })),
}));

function ToolsPage() {
  return (
    <V3DirectoryFamilyIndex
      variant="tools"
      title="Tools"
      eyebrow="DISCOVER & ANALYSE"
      intro="Find useful ways to follow, explore and analyse Solaris."
      browserIntro="Find the right way to explore results, predictions or history."
      searchLabel="Search Solaris tools"
      searchPlaceholder="Search tools and topics…"
      scopeLabel="All categories"
      itemNoun="tools"
      emptyText="Try a different tool name or category."
      groups={GROUPS}
    />
  );
}
