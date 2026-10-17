import { createFileRoute } from "@tanstack/react-router";

import { IntegritySupportStep } from "@/components/integrity/IntegrityReportV5";
import { V3IntegrityReportRouteShell } from "@/components/v3/V3IntegrityReportRouteShell";

export const Route = createFileRoute("/integrity/report/support")({
  head: () => ({
    meta: [
      { title: "Supporting information — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <V3IntegrityReportRouteShell>
      <IntegritySupportStep />
    </V3IntegrityReportRouteShell>
  ),
});
