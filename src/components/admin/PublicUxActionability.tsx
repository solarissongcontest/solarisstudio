import { AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";

import { AdminCard, AdminCardHeader, AdminStatus } from "@/components/admin/AdminUI";
import {
  buildPublicUxFindings,
  PUBLIC_UX_SERVER_GAPS,
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
                The current window has no measured event evidence that crosses the review thresholds. Missing server signals are still unknown, not zero.
              </p>
            </div>
          </div>
        )}
      </AdminCard>

      <AdminCard className="!border-amber-200/15">
        <AdminCardHeader
          eyebrow="Coverage"
          title="Canonical signals still unavailable"
          description="The current privacy-safe server projection cannot yet answer these Admin V3 questions. Solaris deliberately does not infer them from unrelated counts."
        />
        <div className="mt-4 space-y-2">
          {PUBLIC_UX_SERVER_GAPS.map((label) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/10 px-3 py-2.5"
            >
              <AlertTriangle className="size-3.5 shrink-0 text-amber-100" aria-hidden="true" />
              <span className="text-xs font-semibold">{label}</span>
              <AdminStatus tone="neutral" className="ml-auto">Server gap</AdminStatus>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          System request #753 owns the bounded aggregate projection for these signals. Public UX remains building until that evidence exists and is validated.
        </p>
      </AdminCard>
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
