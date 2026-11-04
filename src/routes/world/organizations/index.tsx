import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TerraWorldDirectory } from "@/components/world/TerraWorldDirectory";

export const Route = createFileRoute("/world/organizations/")({
  head: () => ({ meta: [
    { title: "International Organizations — Terra Solaris" },
    { name: "description", content: "Search and filter published international Terra Solaris organizations." },
  ] }),
  component: OrganizationsPage,
});
function OrganizationsPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl pb-12 pt-4">
        <Link to="/world/" className="mb-7 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft aria-hidden="true" className="size-4" /> Terra Solaris
        </Link>
        <TerraWorldDirectory />
      </div>
    </AppShell>
  );
}
