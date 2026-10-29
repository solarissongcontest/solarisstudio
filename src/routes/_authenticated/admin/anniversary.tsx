import { createFileRoute, Link } from "@tanstack/react-router";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { ORGANIZER_ANNIVERSARY_PREVIEWS } from "@/lib/v3-organizer-anniversary-preview";

export const Route = createFileRoute("/_authenticated/admin/anniversary")({
  head: () => ({
    meta: [
      { title: "Anniversary Preview — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AnniversaryPreviewPage,
});

function AnniversaryPreviewPage() {
  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          eyebrow="Storytelling · Anniversary"
          title="Anniversary Preview"
          description="Preview deterministic Anniversary Day and countdown surfaces without changing the system clock. Storytelling is the canonical editorial parent; this route remains the low-frequency preview and historical-date companion until the governed milestone workflow reaches parity."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/storytelling" className="admin-action-primary">
                Storytelling & Anniversary
              </Link>
              <Link to="/admin/anniversary-dates" className="admin-action-secondary">
                Historical edition dates
              </Link>
            </div>
          }
        />

        <AdminCard strong>
          <AdminCardHeader
            eyebrow="Canonical ownership"
            title="Anniversary belongs to Storytelling"
            description="Generated anniversary moments come from published historical story data. Manual milestones, scheduling and editorial publication must use governed Anniversary authority rather than inventing client-only state on this preview page."
            action={<AdminStatus tone="attention">Editorial lifecycle building</AdminStatus>}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/admin/storytelling" className="admin-action-primary">
              Open Storytelling → Anniversary
            </Link>
            <Link to="/admin/anniversary-dates" className="admin-action-secondary">
              Maintain historical dates
            </Link>
          </div>
        </AdminCard>

        <AdminCard className="mt-4">
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
            {ORGANIZER_ANNIVERSARY_PREVIEWS.map((preview) => (
              <a
                key={preview.id}
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
