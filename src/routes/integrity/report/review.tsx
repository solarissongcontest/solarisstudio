import { createFileRoute } from "@tanstack/react-router";

import { IntegrityReviewStep } from "@/components/integrity/IntegrityReportV5";
import { V3IntegrityReportRouteShell } from "@/components/v3/V3IntegrityReportRouteShell";

export const Route = createFileRoute("/integrity/report/review")({
  head: () => ({
    meta: [
      { title: "Review report — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <V3IntegrityReportRouteShell>
      <IntegrityReviewStep />
    </V3IntegrityReportRouteShell>
  ),
});
