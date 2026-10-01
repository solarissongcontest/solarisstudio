import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { IntegrityReceiptStep } from "@/components/integrity/IntegrityReportV5";

export const Route = createFileRoute("/integrity/report/receipt")({
  head: () => ({
    meta: [
      { title: "Report receipt — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AppShell><IntegrityReceiptStep /></AppShell>,
});
