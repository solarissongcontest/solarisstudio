import { createFileRoute, notFound } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/AppShell";
import { WorldProxyWorkspace } from "@/components/world/WorldProxyWorkspace";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";

export const Route = createFileRoute("/world/proxies")({
  beforeLoad: () => {
    // Governance does not bypass the emergency Confirmation-only maintenance
    // shell. The workspace independently fails closed on the World rollout flag.
    if (GLOBAL_MAINTENANCE_MODE) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Institutional proxies — Terra Solaris" },
      { name: "description", content: "Governed representative requests, institution approval and proxy revocation." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris · Institutions"
        title="Proxy authority"
        description="Temporary acting representation, institutional review and safe revocation."
      />
      <WorldProxyWorkspace />
    </AppShell>
  ),
});
