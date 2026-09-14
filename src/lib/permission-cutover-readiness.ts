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
  rlsPolicies: 82,
  functions: 58,
  storagePolicies: 7,
  capturedAt: "2026-09-14",
});

export function buildPermissionCutoverReadiness(
  summary: PermissionSummary | undefined,
): PermissionCutoverReadiness {
  const evaluations = summary?.evaluations ?? 0;
  const mismatches = summary?.mismatched ?? 0;

  const gates: PermissionCutoverGate[] = [
    {
      id: "route-shadow",
      label: "Organizer route shadowing",
      detail: "Shared Organizer, Confirmations and Televoting admin shells emit comparison events.",
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
      detail: `${LEGACY_AUTHORIZATION_DEBT.rlsPolicies} RLS policies and ${LEGACY_AUTHORIZATION_DEBT.functions} database functions remain in the audited legacy migration inventory.`,
      state: "blocked",
    },
    {
      id: "strict-dual",
      label: "Strict sensitive-action dual enforcement",
      detail:
        "Edition lifecycle, Incident Command and Feature Rollout are guarded; remaining sensitive actions still need strict dual coverage.",
      state: "blocked",
    },
  ];

  return {
    ready: gates.every((gate) => gate.state === "ready"),
    gates,
  };
}
