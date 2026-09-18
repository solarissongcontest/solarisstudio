import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";

import type { PermissionSummary } from "@/lib/permission-engine-admin";
import {
  buildPermissionCutoverReadiness,
  type PermissionCutoverGateState,
} from "@/lib/permission-cutover-readiness";
import { AdminCard, AdminCardHeader, AdminStatus } from "./AdminUI";

export function PermissionCutoverReadinessPanel({
  summary,
}: {
  summary: PermissionSummary | undefined;
}) {
  const readiness = buildPermissionCutoverReadiness(summary);

  return (
    <AdminCard strong>
      <AdminCardHeader
        eyebrow="Permission Engine v2"
        title="Authoritative enforcement active"
        description="Permission Engine v2 now decides access. This panel tracks audit evidence and the completed migration state."
        action={
          <AdminStatus tone={readiness.ready ? "ready" : "attention"}>
            {readiness.ready ? "Authoritative" : "Review telemetry"}
          </AdminStatus>
        }
      />

      <div className="space-y-2">
        {readiness.gates.map((gate) => {
          const Icon = gateIcon(gate.state);
          return (
            <div
              key={gate.id}
              className="flex min-w-0 items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.025]">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{gate.label}</p>
                  <AdminStatus tone={gateTone(gate.state)}>{gateLabel(gate.state)}</AdminStatus>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{gate.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <details className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
          Advanced · current model
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-muted-foreground">
          <li>Capability assignments and direct grants decide access.</li>
          <li>Route decisions continue to be recorded for audit and troubleshooting.</li>
          <li>Legacy role data is retained only as read-only rollback history.</li>
        </ol>
      </details>
    </AdminCard>
  );
}

function gateIcon(state: PermissionCutoverGateState) {
  if (state === "ready") return CheckCircle2;
  if (state === "waiting") return Clock3;
  return ShieldAlert;
}

function gateTone(state: PermissionCutoverGateState) {
  if (state === "ready") return "ready" as const;
  if (state === "waiting") return "attention" as const;
  return "blocked" as const;
}

function gateLabel(state: PermissionCutoverGateState) {
  if (state === "ready") return "Ready";
  if (state === "waiting") return "Waiting";
  return "Blocked";
}
