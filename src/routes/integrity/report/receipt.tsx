import { createFileRoute } from "@tanstack/react-router";

import { IntegrityReceiptStep } from "@/components/integrity/IntegrityReportV5";
import { V3IntegrityReportRouteShell } from "@/components/v3/V3IntegrityReportRouteShell";

export const Route = createFileRoute("/integrity/report/receipt")({
  head: () => ({
    meta: [
      { title: "Report receipt — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <V3IntegrityReportRouteShell>
      <IntegrityReceiptStep />
    </V3IntegrityReportRouteShell>
  ),
});
