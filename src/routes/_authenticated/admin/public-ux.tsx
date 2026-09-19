import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Gauge,
  MousePointer2,
  Search,
  Smartphone,
} from "lucide-react";
import { useState } from "react";

import {
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  loadPublicUxMetrics,
  loadPublicWebVitalsMetrics,
  type PublicUxGroupCount,
  type PublicWebVitalRouteMetric,
} from "@/lib/public-ux-metrics";

export const Route = createFileRoute("/_authenticated/admin/public-ux")({
  head: () => ({
    meta: [
      { title: "Public UX — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicUxDashboard,
});

function PublicUxDashboard() {
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ["admin-public-ux-metrics", days],
    queryFn: () => loadPublicUxMetrics(days),
    staleTime: 60_000,
  });
  const vitalsQuery = useQuery({
    queryKey: ["admin-public-web-vitals", days],
    queryFn: () => loadPublicWebVitalsMetrics(days),
    staleTime: 60_000,
  });
  const metrics = query.data;
  const vitals = vitalsQuery.data;

  return (
    <div>
      <AdminPageHeader
        eyebrow="Public experience"
        title="Public UX"
        description="Navigation, search and task-completion signals for the public Solaris Studio experience. Search text, form contents, votes, messages and Integrity evidence are deliberately not collected."
        actions={
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-semibold">
            Window
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="bg-transparent text-foreground outline-none"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        }
      />

      {query.isLoading ? (
        <AdminCard>
          <p className="py-10 text-center text-sm text-muted-foreground">
            Loading public UX telemetry…
          </p>
        </AdminCard>
      ) : query.error ? (
        <AdminCard>
          <AdminStatus tone="blocked">
            {query.error instanceof Error ? query.error.message : "Could not load UX telemetry"}
          </AdminStatus>
        </AdminCard>
      ) : metrics ? (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Activity} label="Sessions" value={metrics.totals.sessions} />
            <MetricCard icon={MousePointer2} label="UX events" value={metrics.totals.events} />
            <MetricCard icon={Search} label="Searches" value={metrics.search.submitted} />
            <MetricCard
              icon={Gauge}
              label="No-result searches"
              value={metrics.search.noResults}
              suffix={
                metrics.search.submitted
                  ? `${Math.round((metrics.search.noResults / metrics.search.submitted) * 100)}%`
                  : "0%"
              }
            />
          </section>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Field performance"
              title="Core Web Vitals"
              description="Real-user LCP, INP and CLS measured on public routes. Values are p75 for the selected window and device class."
            />
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              <VitalTarget label="LCP" target="≤ 2.5 s" />
              <VitalTarget label="INP" target="≤ 200 ms" />
              <VitalTarget label="CLS" target="≤ 0.10" />
            </div>
            {vitalsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading field performance telemetry…
              </p>
            ) : vitalsQuery.error ? (
              <AdminStatus tone="blocked">
                {vitalsQuery.error instanceof Error
                  ? vitalsQuery.error.message
                  : "Could not load Web Vitals"}
              </AdminStatus>
            ) : vitals?.routes.length ? (
              <div className="space-y-2">
                {sortVitalRows(vitals.routes)
                  .slice(0, 18)
                  .map((row) => (
                    <div
                      key={`${row.pathname}-${row.metric}-${row.device}`}
                      className="grid gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{row.pathname}</p>
                        <p className="mt-0.5 text-[10px] capitalize text-muted-foreground">
                          {row.device} · {row.samples} sample{row.samples === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="text-xs font-black">{row.metric}</span>
                      <span className="numeric text-xs text-muted-foreground">
                        p75 {formatVital(row)}
                      </span>
                      <AdminStatus tone={vitalTone(row)}>
                        {vitalLabel(row)}
                      </AdminStatus>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No field-performance samples yet. Data appears after public visitors leave or hide a measured page.
              </p>
            )}
          </AdminCard>

          <section className="grid gap-4 xl:grid-cols-2">
            <AdminCard>
              <AdminCardHeader
                eyebrow="Navigation"
                title="Most used destinations"
                description="Public, section and breadcrumb destinations combined."
              />
              <RankedRows
                rows={metrics.navigation.topDestinations.map((item) => ({
                  label: item.target || "Unknown destination",
                  value: item.count,
                }))}
                empty="No navigation events in this window."
              />
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="First click"
                title="Where journeys begin"
                description="The first global-navigation click observed in each measured session."
              />
              <RankedRows
                rows={metrics.navigation.firstClicks.map((item) => ({
                  label: item.destination || item.target || "Unknown",
                  value: item.count,
                }))}
                empty="No first-click data yet."
              />
            </AdminCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
            <AdminCard>
              <AdminCardHeader
                eyebrow="Search"
                title="Findability"
                description="Only result counts, query-length buckets and selected result groups are stored. Raw queries are intentionally absent."
              />
              <div className="grid gap-3 sm:grid-cols-4">
                <MiniMetric label="Opened" value={metrics.search.opened} />
                <MiniMetric label="Submitted" value={metrics.search.submitted} />
                <MiniMetric label="Result clicks" value={metrics.search.resultClicks} />
                <MiniMetric label="Rescue sessions" value={metrics.search.rescueSessions} />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <RankedRows
                  title="Clicked result groups"
                  rows={metrics.search.clickedGroups.map((item) => ({
                    label: item.group_name || "Unknown",
                    value: item.count,
                  }))}
                  empty="No search result clicks yet."
                />
                <RankedRows
                  title="Query length"
                  rows={metrics.search.queryLengthBuckets.map((item) => ({
                    label: item.bucket || "Unknown",
                    value: item.count,
                  }))}
                  empty="No searches yet."
                />
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Friction"
                title="Potential navigation struggle"
                description="These are indicators for review, not proof that a journey failed."
              />
              <div className="space-y-3">
                <SignalRow
                  label="High-step sessions"
                  value={metrics.friction.highStepSessions}
                  detail="Sessions with at least eight measured navigation steps."
                />
                <SignalRow
                  label="Repeated section switching"
                  value={metrics.friction.repeatedSectionSessions}
                  detail="Sessions with at least four global-area switches."
                />
              </div>
            </AdminCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
            <AdminCard>
              <AdminCardHeader
                eyebrow="Tasks"
                title="Start → completion"
                description="Participation task funnels for confirmation and voting flows."
              />
              <div className="space-y-2">
                {metrics.tasks.length ? (
                  metrics.tasks.map((task) => (
                    <div
                      key={task.target}
                      className="grid gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                    >
                      <span className="truncate text-sm font-semibold">{task.target}</span>
                      <span className="text-xs text-muted-foreground">
                        {task.started} started
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {task.completed} completed
                      </span>
                      <AdminStatus
                        tone={
                          task.completionRate >= 90
                            ? "ready"
                            : task.completionRate >= 70
                              ? "info"
                              : "attention"
                        }
                      >
                        {task.completionRate}%
                      </AdminStatus>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No measured task funnels yet.</p>
                )}
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Device"
                title="Measured usage"
                description="Coarse viewport buckets only."
              />
              <DeviceRows rows={metrics.devices} />
            </AdminCard>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function VitalTarget({ label, target }: { label: string; target: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <p className="text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">
        {label}
      </p>
      <p className="numeric mt-1 text-sm font-bold">{target}</p>
    </div>
  );
}

function sortVitalRows(rows: PublicWebVitalRouteMetric[]) {
  return [...rows].sort((a, b) => {
    const severity = (row: PublicWebVitalRouteMetric) =>
      vitalLabel(row) === "Poor" ? 2 : vitalLabel(row) === "Needs improvement" ? 1 : 0;
    return severity(b) - severity(a) || b.samples - a.samples || a.pathname.localeCompare(b.pathname);
  });
}

function vitalLabel(row: PublicWebVitalRouteMetric) {
  if (row.metric === "LCP") {
    if (row.p75 <= 2500) return "Good";
    if (row.p75 <= 4000) return "Needs improvement";
    return "Poor";
  }
  if (row.metric === "INP") {
    if (row.p75 <= 200) return "Good";
    if (row.p75 <= 500) return "Needs improvement";
    return "Poor";
  }
  if (row.p75 <= 0.1) return "Good";
  if (row.p75 <= 0.25) return "Needs improvement";
  return "Poor";
}

function vitalTone(row: PublicWebVitalRouteMetric): "ready" | "attention" | "blocked" {
  const label = vitalLabel(row);
  return label === "Good" ? "ready" : label === "Poor" ? "blocked" : "attention";
}

function formatVital(row: PublicWebVitalRouteMetric) {
  if (row.metric === "LCP") return `${(row.p75 / 1000).toFixed(2)} s`;
  if (row.metric === "INP") return `${Math.round(row.p75)} ms`;
  return row.p75.toFixed(3);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <AdminCard>
      <Icon className="size-4 text-sky-200" aria-hidden="true" />
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[.12em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="numeric text-3xl font-bold">{value}</p>
        {suffix ? <span className="text-xs font-semibold text-muted-foreground">{suffix}</span> : null}
      </div>
    </AdminCard>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[.11em] text-muted-foreground">{label}</p>
      <p className="numeric mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function RankedRows({
  rows,
  empty,
  title,
}: {
  rows: Array<{ label: string; value: number }>;
  empty: string;
  title?: string;
}) {
  return (
    <div>
      {title ? <p className="mb-2 text-xs font-semibold text-foreground">{title}</p> : null}
      {rows.length ? (
        <div className="divide-y divide-white/[0.06]">
          {rows.slice(0, 12).map((row, index) => (
            <div key={`${row.label}-${index}`} className="flex items-center gap-3 py-2.5 first:pt-0">
              <span className="numeric w-5 shrink-0 text-[10px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{row.label}</span>
              <span className="numeric text-xs text-muted-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function SignalRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{label}</span>
        <span className="numeric text-lg font-bold">{value}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function DeviceRows({ rows }: { rows: PublicUxGroupCount[] }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No device data yet.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.device || "unknown"}
          className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
        >
          <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-sm font-semibold capitalize">
            {row.device || "unknown"}
          </span>
          <span className="numeric text-sm text-muted-foreground">{row.count}</span>
        </div>
      ))}
    </div>
  );
}
