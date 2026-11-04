import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TerraWorldMembershipChronicle } from "@/components/world/TerraWorldMembershipChronicle";

export const Route = createFileRoute("/world/membership-history/")({
  head: () => ({
    meta: [
      { title: "Institutional Membership History — Terra Solaris" },
      { name: "description", content: "Explore the public history of Terra Solaris international institutional memberships." },
    ],
  }),
  component: WorldMembershipHistoryPage,
});

function WorldMembershipHistoryPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl pb-12 pt-4">
        <Link to="/countries" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft aria-hidden="true" className="size-4" /> Solaris countries
        </Link>
        <TerraWorldMembershipChronicle />
      </div>
    </AppShell>
  );
}
