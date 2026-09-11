import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { TrustIntegrityHub } from "@/components/integrity/TrustIntegrityHub";

export const Route = createFileRoute("/integrity/")({
  head: () => ({
    meta: [
      { title: "Trust & Integrity — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Report concerns anonymously, use sealed or confidential reporting, ask TSBC privately, follow protected cases and review anonymised SSC integrity decisions.",
      },
    ],
  }),
  component: IntegrityPage,
});

function IntegrityPage() {
  return (
    <AppShell>
      <TrustIntegrityHub />
    </AppShell>
  );
}
