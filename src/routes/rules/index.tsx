import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { RulesExperience } from "@/components/rules/RulesExperience";
import { RulebookVersionBanner } from "@/components/rules/RulebookVersionBanner";
import { usePublishedRulebook } from "@/lib/rules-governance";

export const Route = createFileRoute("/rules/")({
  head: () => ({
    meta: [
      { title: "Official Rules — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Explore the official Solaris Song Contest regulations through visual guides, fast rule checks, search and the complete rulebook.",
      },
    ],
  }),
  component: RulesPage,
});

function RulesPage() {
  const published = usePublishedRulebook();

  return (
    <AppShell>
      <RulebookVersionBanner />
      <RulesExperience key={published.version} />
    </AppShell>
  );
}
