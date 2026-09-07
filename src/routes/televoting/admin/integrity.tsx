import { Link, createFileRoute } from "@tanstack/react-router";

import { IntegrityModerationHub } from "@/components/televoting/IntegrityModerationHub";
import { IntegrityReviewView } from "@/components/televoting/IntegrityReviewView";

export const Route = createFileRoute("/televoting/admin/integrity")({
  head: () => ({
    meta: [
      { title: "Voting Integrity — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityPage,
});

function IntegrityPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Link to="/televoting/admin/jury-integrity" className="admin-action-secondary">
          Jury Independence v5
        </Link>
        <Link to="/televoting/admin/integrity-declarations" className="admin-action-secondary">
          Integrity declarations
        </Link>
      </div>
      <IntegrityReviewView />
      <IntegrityModerationHub />
    </div>
  );
}
