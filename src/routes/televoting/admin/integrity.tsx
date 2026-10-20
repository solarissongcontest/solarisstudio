import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminCard, AdminEmptyState } from "@/components/admin/AdminUI";
import { V3ScopedIntegrityReview } from "@/components/televoting/V3ScopedIntegrityReview";

export const Route = createFileRoute("/televoting/admin/integrity")({
  head: () => ({
    meta: [
      { title: "Voting Integrity — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityRoute,
});

function IntegrityRoute() {
  const { editionId, editionLabel } = useAdminContext();

  if (!editionId) {
    return (
      <div className="admin-page mx-auto max-w-6xl pb-5">
        <AdminCard>
          <AdminEmptyState
            icon={ShieldAlert}
            title="Choose an edition"
            description="Voting integrity is edition-scoped Organizer work. Select the exact edition before Solaris loads voting rounds or ballot evidence."
            action={<Link to="/televoting/admin" className="admin-action-secondary">Back to Voting</Link>}
          />
        </AdminCard>
      </div>
    );
  }

  return (
    <V3ScopedIntegrityReview
      key={editionId}
      editionId={editionId}
      editionLabel={editionLabel?.trim() || editionId}
    />
  );
}