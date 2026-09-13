import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { CountryHodHistoryPanel } from "@/components/CountryHodHistoryPanel";
import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/my-solaris/history")({
  head: () => ({
    meta: [{ title: "MySolaris history — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="MySolaris"
        title="History"
        description="Delegation handovers and historical records in a focused section."
      />
      <div className="space-y-4">
        <CountryHodHistoryPanel inline />
        <Panel
          title="Participation history"
          description="Entries and national finals are managed with the country record"
        >
          <Link
            to={NAV_TARGETS.mySolarisCountry as any}
            className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-primary"
          >
            Open country history →
          </Link>
        </Panel>
      </div>
    </AppShell>
  );
}
