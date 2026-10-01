import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { IntegrityHomeV5 } from "@/components/integrity/IntegrityHomeV5";

export const Route = createFileRoute("/integrity/")({
  head: () => ({
    meta: [
      { title: "Trust & Integrity — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Report a concern, get private rule guidance, follow protected cases and appeal eligible Integrity decisions.",
      },
    ],
  }),
  component: IntegrityPage,
});

function IntegrityPage() {
  return (
    <AppShell>
      <IntegrityHomeV5 />
    </AppShell>
  );
}
