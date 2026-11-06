import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/jury/$slug.tsx", "utf8");
const hooks = readFileSync("src/lib/data.ts", "utf8");

describe("Organizer Jury private evidence and account boundary", () => {
  it("remounts prepared Jury lifecycle actions when actor, edition or selected show changes", () => {
    expect(route).toContain("component: JuryWorkspaceAccountBoundary");
    expect(route).toContain("function JuryWorkspaceAccountBoundary()");
    expect(route).toContain("const actorId = useAuthenticatedUser().id;");
    expect(route).toContain('<JuryWorkspace key={`${actorId}:${slug}:${show ?? "default"}`} />');
  });

  it("partitions confidential ballot status and submission evidence by actor, edition and show", () => {
    expect(route).toContain('queryKey: ["jury_ballot_statuses", actorId, edition?.id ?? "unscoped", "show", selectedShow?.id ?? "pending"]');
    expect(route).toContain('queryKey: ["jury_ballot_submissions", actorId, edition?.id ?? "unscoped", "show", selectedShow?.id ?? "pending"]');
    expect(route.match(/gcTime: 0/g)).toHaveLength(2);
    expect(route.match(/retry: false/g)).toHaveLength(2);
    expect(route.match(/refetchInterval: false/g)).toHaveLength(2);
    expect(route).toContain("enabled: Boolean(actorId && edition?.id && selectedShow?.id)");
  });

  it("uses shared, optionally actor-scoped read hooks without changing public callers", () => {
    expect(route).toContain("useShowVoters(selectedShow?.id, actorId)");
    expect(route).toContain("useJuryVotes(selectedShow?.id, actorId)");
    for (const name of ["useShowVoters", "useJuryVotes"]) {
      const start = hooks.indexOf(`export function ${name}(`);
      expect(start).toBeGreaterThanOrEqual(0);
      const end = hooks.indexOf("\nexport function ", start + 1);
      const body = hooks.slice(start, end < 0 ? undefined : end);
      expect(body).toContain("actorId?: string");
      expect(body).toContain('...(actorId ? ["actor", actorId] : [])');
      expect(body).toContain("actorId ? { gcTime: 0, retry: false");
    }
  });

  it("shows no false completion, DNV or review controls when any required Jury read fails", () => {
    expect(route).toContain("const evidenceError = votersError ?? votesError ?? statusesError ?? submissionsError");
    expect(route).toContain("if (loadingVoters || loadingVotes || loadingStatuses || loadingSubmittedBallots)");
    expect(route).toContain("if (evidenceError) {");
    expect(route).toContain("Jury evidence unavailable");
    expect(route).toContain("Retry jury evidence");
    expect(route).toContain("retryVoters(), retryVotes(), retryStatuses(), retrySubmissions()");
  });

  it("preserves governed lifecycle command identities and does not claim roster or score writer cutover", () => {
    expect(route).toContain("studio2_jury_dnv_preview");
    expect(route).toContain("createOrganisationCommand");
    expect(route).toContain("assign_jury_vote");
    expect(route).toContain("clear_jury_point");
  });
});
