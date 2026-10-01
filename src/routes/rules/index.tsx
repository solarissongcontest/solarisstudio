import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { RulebookVersionBanner } from "@/components/rules/RulebookVersionBanner";
import { RulesHomeV5 } from "@/components/rules/RulesHomeV5";
import { usePublishedRulebook } from "@/lib/rules-governance";

export const Route = createFileRoute("/rules/")({
  head: () => ({
    meta: [
      { title: "Rules — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Search, understand and browse the official Solaris Song Contest rules and the rules that apply to current Solaris tasks.",
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
      <RulesHomeV5 key={published.version} version={published.version} />
    </AppShell>
  );
}
