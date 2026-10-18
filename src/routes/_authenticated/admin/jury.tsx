import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Vote } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminCard, AdminEmptyState } from "@/components/admin/AdminUI";
import { selectOrganizerEdition } from "@/lib/admin-edition-selection";
import { useEditions } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/jury")({
  component: JuryEditionBoundary,
});

function JuryEditionBoundary() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const editionsQuery = useEditions();
  const selectedEdition = selectOrganizerEdition(editionsQuery.data ?? [], editionId);
  const routeSlug = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");

  if (editionsQuery.isLoading) {
    return (
      <AdminCard>
        <p className="py-12 text-center text-sm text-muted-foreground">Verifying Jury edition context…</p>
      </AdminCard>
    );
  }

  if (editionsQuery.error) {
    return (
      <AdminCard>
        <AdminEmptyState
          icon={AlertTriangle}
          title="Jury edition context could not be verified"
          description="Solaris could not verify the selected Organizer edition, so Jury ballot and roster operations remain blocked."
          action={
            <button
              type="button"
              onClick={() => void editionsQuery.refetch()}
              disabled={editionsQuery.isFetching}
              className="admin-action-secondary"
            >
              Retry edition lookup
            </button>
          }
        />
      </AdminCard>
    );
  }

  if (!selectedEdition) {
    return (
      <AdminCard>
        <AdminEmptyState
          icon={Vote}
          title="Choose an edition"
          description="Jury is edition-scoped official voting work. Select the exact Organizer edition before Solaris loads ballots, roster state or correction controls."
          action={
            <Link to="/televoting/admin" className="admin-action-secondary">
              Back to Voting
            </Link>
          }
        />
      </AdminCard>
    );
  }

  if (!routeSlug || routeSlug !== selectedEdition.slug) {
    return (
      <AdminCard data-v3-organizer-jury-scope="mismatch">
        <AdminEmptyState
          icon={AlertTriangle}
          title="Jury edition context mismatch"
          description="This Jury URL belongs to a different edition than the one selected in Solaris Organizer. Ballot and roster operations stay blocked until the URL and Organizer context match."
          action={
            <Link
              to="/admin/jury/$slug"
              params={{ slug: selectedEdition.slug }}
              className="admin-action-primary"
            >
              Open selected edition Jury
            </Link>
          }
        />
      </AdminCard>
    );
  }

  return <Outlet />;
}
