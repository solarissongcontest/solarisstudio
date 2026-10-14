import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  History,
  ShieldAlert,
  Trophy,
} from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminProgress,
  AdminStatus,
} from "@/components/admin/AdminUI";
import type {
  V3OrganizerAttentionItem,
  V3OrganizerDomainSummary,
  V3OrganizerReadinessFactor,
} from "@/lib/v3-organizer-projection";
import { useV3OrganizerProjection } from "@/lib/v3-organizer-projection.query";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({
    meta: [
      { title: "Overview — Solaris Organizer" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "See the current Solaris edition context, highest-priority work, next operation and explainable readiness.",
      },
    ],
  }),
  component: OrganizerOverview,
});

function OrganizerOverview() {
  const { editionId } = useAdminContext();
  const projectionQuery = useV3OrganizerProjection(editionId || null);
  const projection = projectionQuery.data ?? null;

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          eyebrow="Overview"
          title="Solaris Organizer"
          description="Current scope, what needs intervention, what happens next and why the edition is or is not ready."
        />

        {!editionId ? (
          <AdminCard>
            <AdminEmptyState
              icon={Trophy}
              title="Choose an edition"
              description="Select the edition in the Organizer toolbar. Overview never invents an edition scope on its own."
            />
          </AdminCard>
        ) : projectionQuery.isLoading ? (
          <AdminCard>
            <p className="py-8 text-center text-sm text-muted-foreground">
              Building the authoritative Organizer projection…
            </p>
          </AdminCard>
        ) : projectionQuery.error || !projection ? (
          <AdminCard>
            <div className="flex items-start gap-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-100" />
              <div>
                <p className="text-sm font-semibold text-foreground">Organizer state unavailable</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {projectionQuery.error instanceof Error
                    ? projectionQuery.error.message
                    : "Solaris could not verify the current edition projection."}
                </p>
              </div>
            </div>
          </AdminCard>
        ) : (
          <>
            <section
              className="mb-4 flex flex-col gap-3 rounded-2xl border border-sky-200/10 bg-sky-200/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between"
              data-organizer-context-lock=""
              aria-label="Current Organizer context"
            >
              <div className="min-w-0">
                <p className="admin-section-label">Current context</p>
                <h2 className="mt-1 truncate text-lg font-bold tracking-[-.025em] text-foreground">
                  {projection.context.editionLabel}
                  {projection.context.showLabel ? ` · ${projection.context.showLabel}` : ""}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {projection.edition.name} · state {humanize(projection.live.editionState)}
                </p>
              </div>
              <AdminStatus
                tone={
                  projection.risk === "critical"
                    ? "blocked"
                    : projection.risk === "elevated"
                      ? "attention"
                      : "ready"
                }
              >
                {projection.risk === "critical"
                  ? "Critical attention"
                  : projection.risk === "elevated"
                    ? "Needs attention"
                    : "On track"}
              </AdminStatus>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]" aria-label="Current priorities">
              <AdminCard strong>
                <AdminCardHeader
                  eyebrow="Needs attention"
                  title={
                    projection.attention.length
                      ? `${projection.tasks.total} ${projection.tasks.total === 1 ? "item needs" : "items need"} attention`
                      : "No organizer action required"
                  }
                  description={
                    projection.attention.length
                      ? "Only the highest-priority unresolved canonical conditions are shown here."
                      : "Solaris currently has no unresolved Organizer Task for this edition."
                  }
                  action={
                    <Link
                      to="/admin/tasks"
                      search={{ filter: "all" }}
                      className="text-xs font-semibold text-sky-100"
                    >
                      All tasks →
                    </Link>
                  }
                />

                {projection.attention.length ? (
                  <div className="divide-y divide-white/[0.07]">
                    {projection.attention.map((item) => (
                      <AttentionLink key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-200/10 bg-emerald-200/[0.045] p-4">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-200" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Nothing is asking for intervention</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Normal state stays quiet. The next scheduled operation is shown beside this card.
                      </p>
                    </div>
                  </div>
                )}
              </AdminCard>

              <AdminCard>
                <AdminCardHeader
                  eyebrow="Next"
                  title={projection.upcoming[0]?.label ?? "Nothing scheduled"}
                  description={
                    projection.upcoming[0]
                      ? `${projection.upcoming[0].detail} · ${new Date(projection.upcoming[0].at).toLocaleString()}`
                      : "No future operational deadline is currently projected."
                  }
                />
                {projection.upcoming[0] ? (
                  <Link
                    to={projection.upcoming[0].route as any}
                    className="admin-action-secondary w-full"
                  >
                    <Clock3 className="size-4" />
                    Open next operation
                  </Link>
                ) : (
                  <Link to="/admin/tasks" search={{ filter: "all" }} className="admin-action-secondary w-full">
                    <Clock3 className="size-4" />
                    Review task queue
                  </Link>
                )}
              </AdminCard>
            </section>

            <section className="mt-4" aria-label="Edition readiness">
              <AdminCard>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="admin-section-label">Readiness</p>
                    <h2 className="mt-1 text-2xl font-bold tracking-[-.035em]">
                      {projection.readiness.overall}%
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Deterministic edition health, calculated by server rules at {new Date(projection.readiness.calculatedAt).toLocaleTimeString()}.
                    </p>
                  </div>
                  <div className="min-w-44">
                    <AdminProgress value={projection.readiness.overall} />
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      State {projection.readiness.stateVersion}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <ReadinessGroup
                    title="Blocking"
                    items={projection.readiness.blocking}
                    empty="No blocking readiness factor"
                    tone="blocked"
                  />
                  <ReadinessGroup
                    title="Incomplete"
                    items={projection.readiness.incomplete}
                    empty="No incomplete readiness factor"
                    tone="attention"
                  />
                  <ReadinessGroup
                    title="Ready"
                    items={projection.readiness.ready}
                    empty="No verified ready factor"
                    tone="ready"
                  />
                </div>
              </AdminCard>
            </section>

            <section className="mt-4 grid gap-4 lg:grid-cols-[.8fr_1.2fr]" aria-label="Recent changes and domains">
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Recent changes"
                  title={projection.recentChanges.length ? "Meaningful organizer history" : "No recent recorded changes"}
                  description="Recent authoritative audit activity for this edition."
                  action={
                    <Link to="/admin/more" className="text-xs font-semibold text-sky-100">
                      Audit & tools →
                    </Link>
                  }
                />
                {projection.recentChanges.length ? (
                  <div className="divide-y divide-white/[0.07]">
                    {projection.recentChanges.slice(0, 5).map((change) => (
                      <div key={change.id} className="flex items-start gap-3 py-3">
                        <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{humanize(change.action)}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{change.subject}</p>
                        </div>
                        <time className="shrink-0 text-[10px] text-muted-foreground">
                          {new Date(change.createdAt).toLocaleString()}
                        </time>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No edition-scoped audit event is available in this projection.</p>
                )}
              </AdminCard>

              <AdminCard>
                <AdminCardHeader
                  eyebrow="Domains"
                  title="Operational state"
                  description="Quiet summaries stay quiet; problems link directly to the domain that owns them."
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(projection.domains).map(([key, domain]) => (
                    <DomainCard key={key} domain={domain} />
                  ))}
                </div>
              </AdminCard>
            </section>

            <p className="mt-4 text-[10px] text-muted-foreground">
              Authoritative refresh {new Date(projection.serverTime).toLocaleString()} · projection {projection.stateVersion}
            </p>
          </>
        )}
      </div>
    </AdminPage>
  );
}

function AttentionLink({ item }: { item: V3OrganizerAttentionItem }) {
  const critical = item.severity === "critical";
  return (
    <Link to={item.route as any} className="admin-list-row group">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl border ${
          critical
            ? "border-rose-200/15 bg-rose-200/[0.055] text-rose-100"
            : "border-amber-200/15 bg-amber-200/[0.05] text-amber-100"
        }`}
      >
        {critical ? <ShieldAlert className="size-4" /> : <AlertTriangle className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{item.title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.detail}</span>
        <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{item.consequence}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function ReadinessGroup({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: V3OrganizerReadinessFactor[];
  empty: string;
  tone: "blocked" | "attention" | "ready";
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-foreground">{title}</p>
        <AdminStatus tone={tone}>{items.length}</AdminStatus>
      </div>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <Link
              key={item.id}
              to={item.route as any}
              className="block rounded-lg border border-white/[0.06] bg-white/[0.018] p-2.5 transition hover:bg-white/[0.04]"
            >
              <span className="block text-xs font-semibold text-foreground">{item.label}</span>
              <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{item.detail}</span>
            </Link>
          ))
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  );
}

function DomainCard({ domain }: { domain: V3OrganizerDomainSummary }) {
  const tone =
    domain.state === "blocked"
      ? "blocked"
      : domain.state === "attention"
        ? "attention"
        : domain.state === "active"
          ? "info"
          : "ready";

  return (
    <Link
      to={(domain.recommendedAction?.route ?? domain.primaryRoute) as any}
      className="rounded-xl border border-white/[0.07] bg-white/[0.022] p-3 transition hover:border-white/[0.14] hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{domain.label}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{domain.detail}</p>
        </div>
        <AdminStatus tone={tone}>{humanize(domain.state)}</AdminStatus>
      </div>
      {domain.recommendedAction ? (
        <p className="mt-3 text-[11px] font-semibold text-sky-100">{domain.recommendedAction.label} →</p>
      ) : null}
    </Link>
  );
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
