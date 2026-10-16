import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Radio } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminCard, AdminEmptyState } from "@/components/admin/AdminUI";
import { getMergedTelevotingRoundsPage } from "@/integrations/televoting/rounds.functions";

export const Route = createFileRoute("/televoting/admin/rounds/$id")({
  component: VotingRoundEditionGuard,
});

function VotingRoundEditionGuard() {
  const { id: roundId } = Route.useParams();
  const { editionId } = useAdminContext();
  const getRoundsPage = useServerFn(getMergedTelevotingRoundsPage);

  const scopeQuery = useQuery({
    queryKey: ["v3-organizer-voting-round-scope", editionId ?? "unscoped", roundId],
    enabled: Boolean(editionId && roundId),
    queryFn: () => {
      if (!editionId) {
        throw new Error("Voting round access requires an explicit Organizer edition scope.");
      }
      return getRoundsPage({ data: { editionId } });
    },
    staleTime: 10_000,
  });

  if (!editionId) {
    return (
      <div className="admin-page mx-auto max-w-5xl pb-5" data-v3-organizer-voting-round-scope="missing">
        <AdminCard>
          <AdminEmptyState
            icon={Radio}
            title="Choose an edition"
            description="Voting round editing is edition-scoped. Solaris will not open a round from another edition just because its ID is present in the URL."
            action={
              <Link to="/televoting/admin/rounds" className="admin-action-secondary">
                Back to voting rounds
              </Link>
            }
          />
        </AdminCard>
      </div>
    );
  }

  if (scopeQuery.isLoading) {
    return (
      <div className="admin-page mx-auto max-w-5xl pb-5" data-v3-organizer-voting-round-scope="checking">
        <AdminCard>
          <p className="py-10 text-center text-sm text-muted-foreground">
            Confirming voting round edition…
          </p>
        </AdminCard>
      </div>
    );
  }

  if (scopeQuery.error) {
    return (
      <div className="admin-page mx-auto max-w-5xl pb-5" data-v3-organizer-voting-round-scope="error">
        <AdminCard>
          <AdminEmptyState
            icon={Radio}
            title="Voting round scope unavailable"
            description="Solaris could not verify this round against the selected Organizer edition, so editing remains blocked."
            action={
              <Link to="/televoting/admin/rounds" className="admin-action-secondary">
                Back to voting rounds
              </Link>
            }
          />
        </AdminCard>
      </div>
    );
  }

  const roundBelongsToEdition = Boolean(
    scopeQuery.data?.edition?.rounds.some((round) => round.id === roundId),
  );

  if (!roundBelongsToEdition) {
    return (
      <div className="admin-page mx-auto max-w-5xl pb-5" data-v3-organizer-voting-round-scope="mismatch">
        <AdminCard>
          <AdminEmptyState
            icon={Radio}
            title="Round is outside the selected edition"
            description="This URL points to a voting round that is not part of the exact Organizer edition. Switch to the owning edition or choose a round from the current edition."
            action={
              <Link to="/televoting/admin/rounds" className="admin-action-secondary">
                Back to voting rounds
              </Link>
            }
          />
        </AdminCard>
      </div>
    );
  }

  return <Outlet />;
}
