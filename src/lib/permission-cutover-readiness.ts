import type { PermissionSummary } from "./permission-engine-admin";

export type PermissionCutoverGateState = "ready" | "waiting" | "blocked";

export type PermissionCutoverGate = {
  id: "route-shadow" | "evidence" | "mismatches" | "server-coverage" | "strict-dual";
  label: string;
  detail: string;
  state: PermissionCutoverGateState;
};

export type PermissionCutoverReadiness = {
  ready: boolean;
  gates: PermissionCutoverGate[];
};

export const LEGACY_AUTHORIZATION_DEBT = Object.freeze({
  rlsPolicies: 0,
  functions: 0,
  storagePolicies: 0,
  capturedAt: "2026-09-18",
});

export function buildPermissionCutoverReadiness(
  summary: PermissionSummary | undefined,
): PermissionCutoverReadiness {
  const evaluations = summary?.evaluations ?? 0;
  const mismatches = summary?.mismatched ?? 0;

  const gates: PermissionCutoverGate[] = [
    {
      id: "route-shadow",
      label: "Route access telemetry",
      detail: "Organizer, Confirmations and Televoting admin shells record authoritative capability decisions.",
      state: "ready",
    },
    {
      id: "evidence",
      label: "Real observation evidence",
      detail:
        evaluations > 0
          ? `${evaluations} protected route evaluation${evaluations === 1 ? "" : "s"} recorded in the last 30 days.`
          : "No protected route evaluations have been recorded in the last 30 days.",
      state: evaluations > 0 ? "ready" : "waiting",
    },
    {
      id: "mismatches",
      label: "Mismatch review",
      detail:
        evaluations === 0
          ? "Waiting for real observations before a zero-mismatch result means anything."
          : mismatches === 0
            ? "No legacy/capability disagreements were recorded in the observation window."
            : `${mismatches} disagreement${mismatches === 1 ? " needs" : "s need"} classification and resolution.`,
      state: evaluations === 0 ? "waiting" : mismatches === 0 ? "ready" : "blocked",
    },
    {
      id: "server-coverage",
      label: "Server and RLS migration",
      detail: "Legacy Organizer predicates have been removed from application RLS and capability enforcement is authoritative.",
      state: "ready",
    },
    {
      id: "strict-dual",
      label: "Sensitive-action enforcement",
      detail:
        "Sensitive operations have completed capability migration and no longer depend on the legacy Organizer gate.",
      state: "ready",
    },
  ];

  return {
    ready: gates.every((gate) => gate.state === "ready"),
    gates,
  };
}
