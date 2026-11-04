import { createFileRoute, notFound } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/AppShell";
import { WorldVotingRuleEditor } from "@/components/world/WorldVotingRuleEditor";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";

export const Route = createFileRoute("/world/voting/rules")({
  beforeLoad: () => {
    // TG8 must not break the emergency Confirmation-only maintenance portal.
    if (GLOBAL_MAINTENANCE_MODE) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Institutional Voting Rules — Terra Solaris" },
      { name: "description", content: "Governed exact-rational legislative voting policy configuration." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris · Institutional Governance"
        title="Voting-rule authority"
        description="Versioned constitutional rules, exact fractions and permission-scoped administration."
      />
      <WorldVotingRuleEditor />
    </AppShell>
  ),
});
