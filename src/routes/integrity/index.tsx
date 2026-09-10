import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { IntegrityCentre } from "@/components/integrity/IntegrityCentre";

export const Route = createFileRoute("/integrity/")({
  head: () => ({
    meta: [
      { title: "Trust & Integrity — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Report possible SSC rule violations anonymously, continue protected two-way cases and understand the Solaris Song Contest integrity process.",
      },
    ],
  }),
  component: IntegrityPage,
});

function IntegrityPage() {
  return (
    <AppShell>
      <IntegrityCentre />
    </AppShell>
  );
}
