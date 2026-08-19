import { createFileRoute } from "@tanstack/react-router";

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
      <IntegrityReviewView />
      <IntegrityModerationHub />
    </div>
  );
}
