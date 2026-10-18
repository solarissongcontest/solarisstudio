import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Calculator } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminCard, AdminEmptyState } from "@/components/admin/AdminUI";
import { selectOrganizerEdition } from "@/lib/admin-edition-selection";
import { useEditions } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/voting-system")({
  component: VotingRulesEditionBoundary,
});

function VotingRulesEditionBoundary() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const editionsQuery = useEditions();
  const selectedEdition = selectOrganizerEdition(editionsQuery.data ?? [], editionId);
  const routeSlug = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");

  if (editionsQuery.isLoading) {
    return (
      <AdminCard>
        <p className="py-12 text-center text-sm text-muted-foreground">Verifying Voting Rules edition context…</p>
      </AdminCard>
    );
  }

  if (editionsQuery.error) {
    return (
      <AdminCard>
        <AdminEmptyState
          icon={AlertTriangle}
          title="Voting Rules edition context could not be verified"
          description="Solaris could not verify the selected Organizer edition, so voting-configuration reads and saves remain blocked."
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
          icon={Calculator}
          title="Choose an edition"
          description="Voting Rules are edition-scoped official configuration. Select the exact Organizer edition before Solaris loads show rules or exposes save controls."
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
      <AdminCard data-v3-organizer-voting-rules-scope="mismatch">
        <AdminEmptyState
          icon={AlertTriangle}
          title="Voting Rules edition context mismatch"
          description="This Voting Rules URL belongs to a different edition than the one selected in Solaris Organizer. Rule reads and saves stay blocked until the URL and Organizer context match."
          action={
            <Link
              to="/admin/voting-system/$slug"
              params={{ slug: selectedEdition.slug }}
              className="admin-action-primary"
            >
              Open selected edition rules
            </Link>
          }
        />
      </AdminCard>
    );
  }

  return <Outlet />;
}
