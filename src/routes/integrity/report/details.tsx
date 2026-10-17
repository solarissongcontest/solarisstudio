import { createFileRoute } from "@tanstack/react-router";

import { IntegrityDetailsStep } from "@/components/integrity/IntegrityReportV5";
import { V3IntegrityReportRouteShell } from "@/components/v3/V3IntegrityReportRouteShell";

export const Route = createFileRoute("/integrity/report/details")({
  head: () => ({
    meta: [
      { title: "Report details — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <V3IntegrityReportRouteShell>
      <IntegrityDetailsStep />
    </V3IntegrityReportRouteShell>
  ),
});
