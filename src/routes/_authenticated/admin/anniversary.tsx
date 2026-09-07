import { createFileRoute } from "@tanstack/react-router";

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
  { href: "/?anniversary=active", title: "Anniversary Day", description: "Full 17 September takeover with particles, route modules and homepage archive hero." },
  { href: "/?anniversary=countdown", title: "Countdown", description: "Pre-anniversary state without the full particle takeover." },
  { href: "/?anniversary=after", title: "Afterglow", description: "Post-anniversary Year Five state." },
  { href: "/anniversary?anniversary=active", title: "Anniversary hub", description: "Open the permanent anniversary archive with the active visual system." },
  { href: "/my-solaris?anniversary=active", title: "MySolaris story", description: "Preview the personalized country anniversary recap." },
  { href: "/countries?anniversary=active", title: "Country leaderboard", description: "Preview the anniversary delegation table." },
  { href: "/records?anniversary=active", title: "Records", description: "Preview historic result moments and all-time anniversary context." },
] as const;

function AnniversaryPreviewPage() {
  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          eyebrow="17 September"
          title="Anniversary Preview"
          description="Test every annual SSC anniversary state without changing the system clock. Open previews in a new tab and use responsive device mode for phone layouts."
        />

        <AdminCard>
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
            description="The anniversary should remain usable, not merely impressive from a safe distance."
          />
          <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <p>• 390px and 430px phone widths</p>
            <p>• reduced-motion mode</p>
            <p>• country detail and Wiki pages</p>
            <p>• Records, Analysis and Relationships</p>
            <p>• Archive Games and interactive tools</p>
            <p>• voting and confirmation task clarity</p>
            <p>• authenticated MySolaris story</p>
            <p>• no horizontal scrolling anywhere</p>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
