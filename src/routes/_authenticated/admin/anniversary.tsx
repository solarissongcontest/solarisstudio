import { createFileRoute, Link } from "@tanstack/react-router";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminPageHeader } from "@/components/admin/AdminUI";

export const Route = createFileRoute("/_authenticated/admin/anniversary")({
  head: () => ({
    meta: [
      { title: "Anniversary Preview — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnniversaryPreviewPage,
});

const PREVIEWS = [
  { href: "/?anniversary=active", title: "Anniversary Day", description: "Full 17 September takeover with particles, archive facts and homepage anniversary editorial." },
  { href: "/?anniversary=countdown", title: "Countdown", description: "Pre-anniversary state without the full particle takeover." },
  { href: "/?anniversary=after", title: "Afterglow", description: "Post-anniversary new-year state." },
  { href: "/anniversary?anniversary=active", title: "Anniversary hub", description: "Open the permanent anniversary archive with resolved historical results only." },
  { href: "/my-solaris?anniversary=active", title: "MySolaris story", description: "Preview the route-native personalized country anniversary recap and share text." },
  { href: "/countries?anniversary=active", title: "Countries archive", description: "Preview the country directory with anniversary context and canonical delegation statistics." },
  { href: "/records?anniversary=active", title: "Records archive", description: "Preview the record book with anniversary styling and historical context." },
] as const;

function AnniversaryPreviewPage() {
  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          eyebrow="17 September"
          title="Anniversary Preview"
          description="Test every annual SSC anniversary state without changing the system clock. Open previews in a new tab and use responsive device mode for phone layouts."
          actions={
            <Link to="/admin/anniversary-dates" className="admin-action-primary">
              Manage edition dates
            </Link>
          }
        />

        <AdminCard>
          <AdminCardHeader
            eyebrow="Historical accuracy"
            title="Exact edition dates power the anniversary year"
            description="Anniversary-year statistics depend on each edition's Grand Final or main event date. Unresolved zero-point placeholder finals are excluded from champions, closest finishes and historical wins."
          />
          <div className="mt-4">
            <Link to="/admin/anniversary-dates" className="admin-action-secondary">
              Open edition date editor →
            </Link>
          </div>
        </AdminCard>

        <AdminCard className="mt-4">
          <AdminCardHeader
            eyebrow="Preview states"
            title="Open an anniversary surface"
            description="These URLs only change the current browser view. They do not publish or alter anniversary data."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PREVIEWS.map((preview) => (
              <a
                key={preview.href}
                href={preview.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]"
              >
                <p className="text-sm font-semibold text-foreground">{preview.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{preview.description}</p>
                <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-primary">Open preview →</p>
              </a>
            ))}
          </div>
        </AdminCard>

        <AdminCard className="mt-4">
          <AdminCardHeader
            eyebrow="QA"
            title="What to test"
            description="The anniversary should remain usable, historically correct and boringly deterministic underneath the glitter."
          />
          <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <p>• 390px and 430px phone widths</p>
            <p>• reduced-motion mode</p>
            <p>• latest champion follows newest resolved final</p>
            <p>• zero-point current placeholders never become records</p>
            <p>• country detail and Wiki pages</p>
            <p>• Records, Analysis and Relationships</p>
            <p>• Archive Games and interactive tools</p>
            <p>• voting and confirmation task clarity</p>
            <p>• authenticated MySolaris story and copy button</p>
            <p>• no horizontal scrolling anywhere</p>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
