import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorldMembershipHistoryScreen } from "@/components/world/WorldMembershipHistory";
import { WorldPublicGate } from "@/components/world/WorldPublic";

export const Route = createFileRoute("/world/membership-history/$slug/$code")({
  head: () => ({
    meta: [
      { title: "Country membership history — Terra Solaris" },
      {
        name: "description",
        content: "Public country membership timeline, representative history and offices in a Terra Solaris institution.",
      },
      // Public but not discoverable as an official result until its TG2
      // institutional source and the public world directory are integrated.
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: MembershipHistoryPage,
});

function MembershipHistoryPage() {
  const { slug, code } = Route.useParams();
  return (
    <WorldPublicGate verifyOnMount>
      <AppShell>
        <WorldMembershipHistoryScreen slug={slug} code={code} />
      </AppShell>
    </WorldPublicGate>
  );
}
