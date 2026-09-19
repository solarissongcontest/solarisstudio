import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Home, ListTree } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader } from "@/components/admin/AdminUI";

export const Route = createFileRoute("/_authenticated/admin/$")({
  head: () => ({
    meta: [
      { title: "Page not found — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: OrganizerNotFound,
});

function OrganizerNotFound() {
  return (
    <AdminPage>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeader
          eyebrow="Solaris Organizer"
          title="This Organizer page does not exist"
          description="The link may be outdated, the page may have moved, or the address may be incomplete. Nothing in the contest was changed."
        />
        <AdminCard>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/admin/operations" className="admin-action-primary">
              <Home className="size-4" /> Organizer Home
            </Link>
            <Link to="/admin/menu" className="admin-action-secondary">
              <ListTree className="size-4" /> All Organizer tools
            </Link>
            <button type="button" onClick={() => window.history.back()} className="admin-action-secondary">
              <ArrowLeft className="size-4" /> Back
            </button>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
