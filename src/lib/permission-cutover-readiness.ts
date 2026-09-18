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
      label: "Authoritative route audit",
      detail:
        "Organizer, Confirmations and Televoting route probes now record the capability decision used by Permission Engine v2.",
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
      label: "Pre-cutover mismatch review",
      detail:
        evaluations === 0
          ? "Waiting for route evidence."
          : mismatches === 0
            ? "No unresolved legacy/capability disagreements remain in the observation window."
            : `${mismatches} historical disagreement${mismatches === 1 ? " still needs" : "s still need"} review.`,
      state: evaluations === 0 ? "waiting" : mismatches === 0 ? "ready" : "blocked",
    },
    {
      id: "server-coverage",
      label: "Server and RLS migration",
      detail:
        "All audited public, Storage and Televoting RLS policy debt has been migrated to capability-aware authorization.",
      state: "ready",
    },
    {
      id: "strict-dual",
      label: "Authoritative capability enforcement",
      detail:
        "Permission Engine v2 is the authorization source; lifecycle, result, incident and publication safeguards remain independently enforced.",
      state: "ready",
    },
  ];

  return {
    ready: gates.every((gate) => gate.state === "ready"),
    gates,
  };
}
