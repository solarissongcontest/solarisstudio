import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { AdvancedRulesTools } from "@/components/rules/AdvancedRulesTools";
import { RulesExperienceRefined } from "@/components/rules/RulesExperienceRefined";
import { RulebookVersionBanner } from "@/components/rules/RulebookVersionBanner";
import { usePublishedRulebook } from "@/lib/rules-governance";

export const Route = createFileRoute("/rules/")({
  head: () => ({
    meta: [
      { title: "Official Rules — Solaris Song Contest" },
      {
        name: "description",
        content: "Read and search the official Solaris Song Contest regulations.",
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
      <RulesExperienceRefined key={published.version} />
      <AdvancedRulesTools />
    </AppShell>
  );
}
