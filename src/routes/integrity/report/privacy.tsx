import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { IntegrityPrivacyStep } from "@/components/integrity/IntegrityReportV5";

export const Route = createFileRoute("/integrity/report/privacy")({
  head: () => ({
    meta: [
      { title: "Report privacy — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AppShell><IntegrityPrivacyStep /></AppShell>,
});
