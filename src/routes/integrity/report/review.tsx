import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { IntegrityReviewStep } from "@/components/integrity/IntegrityReportV5";

export const Route = createFileRoute("/integrity/report/review")({
  head: () => ({
    meta: [
      { title: "Review report — Trust & Integrity" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <AppShell><IntegrityReviewStep /></AppShell>,
});
