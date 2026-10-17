import { createFileRoute } from "@tanstack/react-router";

import { IntegrityPrivacyStep } from "@/components/integrity/IntegrityReportV5";
import { V3IntegrityReportRouteShell } from "@/components/v3/V3IntegrityReportRouteShell";

export const Route = createFileRoute("/integrity/report/privacy")({
  head: () => ({
    meta: [
      { title: "Report privacy — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <V3IntegrityReportRouteShell>
      <IntegrityPrivacyStep />
    </V3IntegrityReportRouteShell>
  ),
});
