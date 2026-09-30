import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { IntegritySupportStep } from "@/components/integrity/IntegrityReportV5";

export const Route = createFileRoute("/integrity/report/support")({
  head: () => ({
    meta: [
      { title: "Supporting information — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AppShell><IntegritySupportStep /></AppShell>,
});
