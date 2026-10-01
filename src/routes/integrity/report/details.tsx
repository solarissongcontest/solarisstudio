import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { IntegrityDetailsStep } from "@/components/integrity/IntegrityReportV5";

export const Route = createFileRoute("/integrity/report/details")({
  head: () => ({
    meta: [
      { title: "Report details — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AppShell><IntegrityDetailsStep /></AppShell>,
});
