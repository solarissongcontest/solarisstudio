import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  RadioTower,
  Trophy,
  Users,
  Vote,
} from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminProgress,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { useAdminContext } from "@/components/admin/AdminContext";
import { editionLabel, useAllParticipants, useAllShows, useCountries, useEditions } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({
    meta: [
      { title: "Overview — Solaris Organizer" },
      { name: "description", content: "The mobile-first organizer overview for the current Solaris Song Contest edition." },
    ],
  }),
  component: OrganizerOverview,
});

function OrganizerOverview() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const { data: countries = [] } = useCountries();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();

  const activeEdition = editions.find((edition) => edition.id === editionId) ?? editions[0] ?? null;
  const editionShows = activeEdition ? shows.filter((show) => show.edition_id === activeEdition.id) : [];
  const editionParticipants = activeEdition
    ? participants.filter((participant) => participant.edition_id === activeEdition.id)
    : [];

  const publishedShows = editionShows.filter((show) => show.published).length;
  const setupSignals = [
    Boolean(activeEdition),
    editionShows.length > 0,
    editionParticipants.length > 0,
    publishedShows > 0,
  ];
  const readiness = Math.round((setupSignals.filter(Boolean).length / setupSignals.length) * 100);

  const issues = [
    !activeEdition
      ? { label: "Choose or create an edition", description: "The workspace needs an active contest edition before edition-specific work can begin.", to: "/admin", tone: "blocked" as const }
      : null,
    activeEdition && editionShows.length === 0
      ? { label: "No shows created yet", description: `Create the shows for ${editionLabel(activeEdition)} before adding running orders or results.`, to: `/admin/${activeEdition.slug}`, tone: "attention" as const }
      : null,
    activeEdition && editionShows.length > 0 && editionParticipants.length === 0
      ? { label: "No entries assigned", description: "The edition has shows, but no participants are attached to them yet.", to: `/admin/${activeEdition.slug}`, tone: "attention" as const }
      : null,
    activeEdition && editionShows.length > 0 && publishedShows === 0
      ? { label: "Nothing is public yet", description: "The edition exists, but none of its shows currently expose public information.", to: `/admin/${activeEdition.slug}`, tone: "info" as const }
      : null,
  ].filter(Boolean) as Array<{ label: string; description: string; to: string; tone: "attention" | "blocked" | "info" }>;

  const progress = [
    { label: "Shows", value: editionShows.length, target: Math.max(editionShows.length, 3), detail: editionShows.length ? `${editionShows.length} configured` : "Not started" },
    { label: "Entries", value: editionParticipants.length, target: Math.max(editionParticipants.length, countries.length || 1), detail: editionParticipants.length ? `${editionParticipants.length} assigned` : "Not started" },
    { label: "Public shows", value: publishedShows, target: Math.max(editionShows.length, 1), detail: editionShows.length ? `${publishedShows}/${editionShows.length} public` : "No shows" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Organizer overview"
        title={activeEdition ? editionLabel(activeEdition) : "Solaris Studio"}
        description={activeEdition ? `${activeEdition.name} · the next actions and readiness signals that matter right now.` : "Choose an edition to begin organizing."}
        actions={
          activeEdition ? (
            <Link to={`/admin/${activeEdition.slug}` as any} className="admin-action-secondary">
              Open edition <ArrowRight className="size-4" />
            </Link>
          ) : null
        }
      />

      <AdminCard strong className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-section-label">Contest readiness</p>
            <p className="mt-2 text-3xl font-bold tracking-[-.04em]">{readiness}%</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              A quick setup signal based on the edition, shows, entries and public show information.
            </p>
          </div>
          <AdminStatus tone={readiness >= 100 ? "ready" : readiness >= 50 ? "attention" : "info"}>
            {readiness >= 100 ? "Ready" : readiness >= 50 ? "In progress" : "Setup"}
          </AdminStatus>
        </div>
        <div className="mt-4"><AdminProgress value={readiness} /></div>
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
        <AdminCard>
          <AdminCardHeader
            eyebrow="Next actions"
            title={issues.length ? `${issues.length} ${issues.length === 1 ? "thing needs" : "things need"} attention` : "Nothing obvious is blocking setup"}
            description="Start here instead of hunting through the admin navigation."
            action={<Link to="/admin/action-centre" className="admin-action-quiet !min-h-9 !px-2 text-xs">All checks →</Link>}
          />

          {issues.length ? (
            <div className="space-y-2">
              {issues.map((issue) => (
                <Link key={issue.label} to={issue.to as any} className="flex min-w-0 items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 transition hover:bg-white/[0.045]">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-amber-200/[0.07] text-amber-100">
                    <AlertTriangle className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{issue.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{issue.description}</span>
                  </span>
                  <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200/10 bg-emerald-200/[0.045] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-200" />
                <p className="text-sm leading-relaxed text-muted-foreground">Core edition setup has data in place. Use the detailed readiness view for publication and voting checks.</p>
              </div>
            </div>
          )}
        </AdminCard>

        <AdminCard>
          <AdminCardHeader eyebrow="Progress" title="Current edition" description="A compact view of the parts you are most likely to check from your phone." />
          <div className="space-y-4">
            {progress.map((item) => {
              const percent = Math.min(100, Math.round((item.value / Math.max(item.target, 1)) * 100));
              return (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <AdminProgress value={percent} />
                </div>
              );
            })}
          </div>
        </AdminCard>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink to="/confirmations/admin" icon={ClipboardCheck} label="Delegations" detail="Confirmations" />
        <QuickLink to="/televoting/admin" icon={Vote} label="Voting" detail="Rounds & ballots" />
        <QuickLink to={activeEdition ? `/admin/design/${activeEdition.slug}` : "/admin"} icon={RadioTower} label="Broadcast" detail="Design & show" />
        <QuickLink to="/admin/more" icon={Flag} label="More" detail="System & tools" />
      </div>

      <AdminCard className="mt-4">
        <AdminCardHeader title="Archive at a glance" />
        <div className="grid grid-cols-3 gap-3 text-center">
          <ArchiveStat icon={Trophy} label="Editions" value={editions.length} />
          <ArchiveStat icon={Users} label="Countries" value={countries.length} />
          <ArchiveStat icon={Flag} label="Entries" value={participants.length} />
        </div>
      </AdminCard>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, detail }: { to: string; icon: typeof Vote; label: string; detail: string }) {
  return (
    <Link to={to as any} className="admin-card flex min-h-28 flex-col justify-between p-3 transition hover:border-white/[0.15] hover:bg-white/[0.045]">
      <span className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><Icon className="size-4" /></span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </Link>
  );
}

function ArchiveStat({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: number }) {
  return (
    <div>
      <Icon className="mx-auto size-4 text-muted-foreground" />
      <p className="mt-2 text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
