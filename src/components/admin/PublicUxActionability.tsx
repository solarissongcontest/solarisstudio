import { AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";

import { AdminCard, AdminCardHeader, AdminStatus } from "@/components/admin/AdminUI";
import {
  buildPublicUxFindings,
  publicUxServerGaps,
  type PublicUxFindingTone,
} from "@/lib/public-ux-findings";
import type { PublicUxMetrics, PublicWebVitalRouteMetric } from "@/lib/public-ux-metrics";

export function PublicUxActionabilityPanel({
  metrics,
  vitalRows,
}: {
  metrics: PublicUxMetrics;
  vitalRows: readonly PublicWebVitalRouteMetric[];
}) {
  const findings = buildPublicUxFindings(metrics, vitalRows);
  const serverGaps = publicUxServerGaps(metrics);
  const diagnostics = metrics.diagnostics;
  const coverageRows = diagnostics
    ? [
        {
          label: "Route backtracking",
          value: `${diagnostics.routeBacktracking.sessions} sessions · ${diagnostics.routeBacktracking.events} returns`,
          detail: diagnostics.routeBacktracking.topDestinations[0]
            ? `Top: ${diagnostics.routeBacktracking.topDestinations[0].destination} (${diagnostics.routeBacktracking.topDestinations[0].count})`
            : "No measured backtracks in this window.",
          definition: diagnostics.definitions.routeBacktracking,
        },
        {
          label: "Dead ends",
          value: `${diagnostics.deadEnds.sessions} sessions`,
          detail: diagnostics.deadEnds.topRoutes[0]
            ? `Top: ${diagnostics.deadEnds.topRoutes[0].pathname} · ${diagnostics.deadEnds.topRoutes[0].source} (${diagnostics.deadEnds.topRoutes[0].count})`
            : "No measured dead ends in this window.",
          definition: diagnostics.definitions.deadEnds,
        },
        {
          label: "Workflow abandonment",
          value: `${diagnostics.workflowAbandonment.abandoned} / ${diagnostics.workflowAbandonment.eligibleStarts} eligible runs`,
          detail: diagnostics.workflowAbandonment.tasks[0]
            ? `Top: ${diagnostics.workflowAbandonment.tasks[0].target} · ${Math.round(diagnostics.workflowAbandonment.tasks[0].abandonmentRate)}%`
            : `No eligible ${diagnostics.workflowAbandonment.windowMinutes}-minute task runs in this window.`,
          definition: diagnostics.definitions.workflowAbandonment,
        },
        {
          label: "Error classes",
          value: `${diagnostics.errors.total} classified errors`,
          detail: diagnostics.errors.classes[0]
            ? `Top: ${diagnostics.errors.classes[0].errorClass} (${diagnostics.errors.classes[0].count})`
            : "No classified public errors in this window.",
          definition: diagnostics.definitions.errorClasses,
        },
      ]
    : [];

  return (
    <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <AdminCard strong>
        <AdminCardHeader
          eyebrow="Actionability"
          title="What should we fix next?"
          description="Prioritized findings are derived only from aggregate signals that the current server projection actually provides. Thresholds identify review candidates; they are not automatic proof of a UX defect."
        />
        {findings.length ? (
          <div className="mt-4 space-y-2">
            {findings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-xl border border-white/[0.07] bg-black/10 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{finding.title}</p>
                  <AdminStatus tone={statusTone(finding.tone)}>{statusLabel(finding.tone)}</AdminStatus>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{finding.evidence}</p>
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-sky-200/10 bg-sky-200/[0.035] p-2.5">
                  <ListChecks className="mt-0.5 size-3.5 shrink-0 text-sky-100" aria-hidden="true" />
                  <p className="text-xs leading-5 text-sky-50/90">{finding.action}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-200" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">No actionable aggregate evidence yet</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The current window has no measured event evidence that crosses the review thresholds.
                Missing server signals remain unknown rather than zero.
              </p>
            </div>
          </div>
        )}
      </AdminCard>

      {serverGaps.length ? (
        <AdminCard className="!border-amber-200/15">
          <AdminCardHeader
            eyebrow="Coverage"
            title="Canonical signals still unavailable"
            description="This server is still exposing the older Public UX projection. Solaris deliberately does not infer missing diagnostics from unrelated counts."
          />
          <div className="mt-4 space-y-2">
            {serverGaps.map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/10 px-3 py-2.5"
              >
                <AlertTriangle className="size-3.5 shrink-0 text-amber-100" aria-hidden="true" />
                <span className="text-xs font-semibold">{label}</span>
                <span className="ml-auto">
                  <AdminStatus tone="neutral">Server gap</AdminStatus>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            The workspace will unlock these aggregates only after schema-v2 diagnostics are present;
            missing values never masquerade as a perfect zero.
          </p>
        </AdminCard>
      ) : (
        <AdminCard className="!border-emerald-200/15">
          <AdminCardHeader
            eyebrow="Coverage"
            title="Canonical diagnostic coverage available"
            description={`Public UX projection schema v${metrics.schemaVersion} supplies all four bounded diagnostic families required by the V3 workspace.`}
          />
          <div className="mt-4 space-y-2">
            {coverageRows.map((row) => (
              <div
                key={row.label}
                className="rounded-xl border border-white/[0.07] bg-black/10 px-3 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-200" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{row.label}</span>
                      <AdminStatus tone="ready">Available</AdminStatus>
                    </div>
                    <p className="numeric mt-1 text-xs font-bold text-foreground">{row.value}</p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{row.detail}</p>
                    <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground/80">
                      {row.definition}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            The projection is aggregate-only: it does not expose replayable session histories, raw search
            text, form contents, votes, messages, Integrity evidence, error messages or stack traces.
          </p>
        </AdminCard>
      )}
    </section>
  );
}

function statusTone(tone: PublicUxFindingTone): "blocked" | "attention" | "info" {
  return tone;
}

function statusLabel(tone: PublicUxFindingTone) {
  if (tone === "blocked") return "High priority";
  if (tone === "attention") return "Review";
  return "Monitor";
}
