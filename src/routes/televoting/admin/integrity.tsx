import { createFileRoute } from "@tanstack/react-router";

import { IntegrityReviewView } from "@/components/televoting/IntegrityReviewView";

export const Route = createFileRoute("/televoting/admin/integrity")({
  head: () => ({
    meta: [
      { title: "Voting Integrity — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityReviewView,
});
