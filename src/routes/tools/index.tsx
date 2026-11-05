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
      title="Tools"
      variant="actions"
      eyebrow="SOLARIS TOOLKIT"
      intro="Explore results, follow the contest and discover more."
      browserIntro="Useful ways to follow the contest and explore its history."
      searchLabel="Search Solaris tools"
      searchPlaceholder="Search tools and topics…"
      scopeLabel="All categories"
      itemNoun="tools"
      emptyText="Try a different tool name or category."
      groups={GROUPS}
    />
  );
}
