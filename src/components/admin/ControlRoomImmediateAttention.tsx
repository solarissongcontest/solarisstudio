import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

import type { EditionReadiness } from "@/lib/admin-readiness";
import type { Studio2IncidentRecord } from "@/lib/studio2-persistence";
import {
  buildControlRoomAttention,
  type ControlRoomAttentionSeverity,
} from "@/lib/v3-organizer-control-room-attention";
import { AdminCard, AdminCardHeader, AdminStatus } from "./AdminUI";

export function ControlRoomImmediateAttention({
  readiness,
  incidents,
  readinessLoading,
  readinessError,
}: {
  readiness: EditionReadiness | null;
  incidents: Studio2IncidentRecord[];
  readinessLoading: boolean;
  readinessError: unknown;
}) {
  const items = buildControlRoomAttention(readiness, incidents);

  return (
    <AdminCard strong>
      <AdminCardHeader
        eyebrow="Immediate attention"
        title={items.length ? `${items.length} operational exception${items.length === 1 ? "" : "s"}` : "No active blocker"}
        description="Exception-first view of active incidents and canonical readiness blockers for the selected edition. Resolve work in its owning workspace; this summary does not create a second mutation path."
        action={
          items.some((item) => item.severity === "critical") ? (
            <AdminStatus tone="blocked">Critical</AdminStatus>
          ) : items.length ? (
            <AdminStatus tone="attention">Attention</AdminStatus>
          ) : readinessLoading ? (
            <AdminStatus tone="info">Evaluating</AdminStatus>
          ) : (
            <AdminStatus tone="ready">Clear</AdminStatus>
          )
        }
      />

      {readinessError ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200/20 bg-amber-200/[0.06] p-3 text-xs text-amber-50">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Readiness evidence is unavailable, so this panel cannot claim the edition is clear. Incident state remains visible below.</p>
        </div>
      ) : null}

      {items.length ? (
        <div className="mt-3 divide-y divide-white/[0.07] border-t border-white/[0.07]">
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className="flex min-h-14 items-start gap-3 py-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-black/10">
                {item.kind === "incident" ? (
                  <ShieldAlert className="size-4" />
                ) : (
                  <AlertTriangle className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{item.title}</span>
                  <AdminStatus tone={attentionTone(item.severity)}>
                    {item.kind === "incident" ? "Incident" : "Readiness"}
                  </AdminStatus>
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span>
              </span>
            </div>
          ))}
          {items.length > 8 ? (
            <p className="py-3 text-xs text-muted-foreground">{items.length - 8} more exception{items.length - 8 === 1 ? "" : "s"} remain in the owning workspaces.</p>
          ) : null}
        </div>
      ) : readinessLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Evaluating edition readiness and active operational exceptions…</p>
      ) : readinessError ? null : (
        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-100">
          <CheckCircle2 className="size-4" />
          No active incident or critical/action readiness exception is currently known.
        </div>
      )}
    </AdminCard>
  );
}

function attentionTone(severity: ControlRoomAttentionSeverity) {
  if (severity === "critical") return "blocked" as const;
  if (severity === "action") return "attention" as const;
  return "neutral" as const;
}
