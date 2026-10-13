import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { RulesHomeV5 } from "@/components/rules/RulesHomeV5";
import { V3RulesRouteGate } from "@/components/v3/V3RulesRouteGate";
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
  const content = <RulesHomeV5 key={published.version} version={published.version} />;

  return (
    <V3RulesRouteGate
      phaseLabel="Rules"
      resolvingTitle="Opening Rules"
      legacy={<AppShell>{content}</AppShell>}
    >
      {content}
    </V3RulesRouteGate>
  );
}
