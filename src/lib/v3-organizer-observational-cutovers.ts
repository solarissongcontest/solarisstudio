/**
 * Accepted observational slices. These declarations do not enable rollout flags.
 * Specialist compatibility paths remain deliberate aliases to the same canonical
 * read owner; they do not introduce result calculation or mutation authority.
 */
export const V3_ORGANIZER_OBSERVATIONAL_CUTOVERS = {
  "current-edition-overview": { owner: "edition.read", route: "/admin/operations", kind: "canonical-operational-projection" },
  "voting-intelligence": { owner: "voting.read", route: "/admin/friend-voting", kind: "evidence-read" },
  "voting-anti-abuse": { owner: "voting.read", route: "/admin/friend-voting", kind: "evidence-read" },
  "voting-analytics": { owner: "voting.read", route: "/televoting/admin/analytics", kind: "scoped-read" },
  "voting-audit-log": { owner: "voting.read", route: "/televoting/admin/audit-log", kind: "bounded-read" },
  "voting-result-backtest": { owner: "voting.read", route: "/televoting/admin/backtest", kind: "read-only-simulation" },
  "live-review-simulation-lab": { owner: "edition.read", route: "/admin/edition-simulator", kind: "local-simulation" },
  "live-review-voting-lab": { owner: "voting.read", route: "/admin/voting-lab", kind: "synthetic-simulation" },
  "workspace-administration": { owner: "edition.read", route: "/admin/more", kind: "presentation-directory" },
  "workspace-organizer-guide": { owner: "edition.read", route: "/admin/guide", kind: "presentation-guidance" },
} as const;

export const V3_ORGANIZER_OBSERVATIONAL_EVIDENCE =
  "src/lib/v3-organizer-observational-acceptance.test.tsx; scripts/fixtures/v3-organizer-observational-proof.ts; scripts/fixtures/v3-organizer-lab-proof.tsx; scripts/fixtures/v3-organizer-overview-proof.tsx; src/lib/v3-organizer-private-read-isolation.test.ts; src/lib/authoritative-runtime-access-contract.test.ts";
