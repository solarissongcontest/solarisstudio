import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve(process.cwd(), "scripts/check-v3-world-private-query-scope.mjs");
const fixtureRoots: string[] = [];
type Finding = { file: string; line: number; code: string; detail: string };
type Report = {
  status: "pass" | "fail";
  inspected: string[];
  absent: string[];
  violations: Finding[];
  proof: string;
};

function runFixture(sources: Record<string, string>): { status: number | null; report: Report } {
  const root = mkdtempSync(join(tmpdir(), "solaris-private-world-"));
  fixtureRoots.push(root);
  for (const [file, source] of Object.entries(sources)) {
    const full = join(root, "src/components/world", file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, source);
  }
  const processResult = spawnSync(
    process.execPath, [script, "--root", root, "--json"],
    { encoding: "utf8", timeout: 10_000 },
  );
  expect(processResult.error).toBeUndefined();
  return { status: processResult.status, report: JSON.parse(processResult.stdout) as Report };
}

const mediation = "WorldMediationWorkspace.tsx";
const ethics = "WorldEthicsWorkspace.tsx";
const court = "WorldCourtWorkspace.tsx";
const privateRoom = "WorldPrivateWorkspace.tsx";

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("TG19 private World actor cache-source guard", () => {
  it("rejects private mounted queries keyed only by feature/caseId, even with gcTime zero", () => {
    const result = runFixture({
      [mediation]: `
        function Workspace({ caseId }) {
          supabase.auth.onAuthStateChange(() => {});
          return useQuery({
            queryKey: ["world", "mediation", "history", caseId],
            gcTime: 0, refetchOnMount: "always",
            queryFn: fetchPrivateHistory,
          });
        }
      `,
    });
    expect(result.status).toBe(1);
    expect(result.report.violations.map((item) => item.code))
      .toContain("ACTOR_NOT_IN_QUERY_KEY");
  });

  it("does not accept actorId written only in a string or comment", () => {
    const result = runFixture({
      [ethics]: `
        function Workspace({ caseId }) {
          supabase.auth.onAuthStateChange(() => {});
          // actorId is not a real query-key dependency
          return useQuery({
            queryKey: ["world", "ethics", "evidence", caseId, "actorId"],
            queryFn: fetchPrivateEvidence,
          });
        }
      `,
    });
    expect(result.status).toBe(1);
    expect(result.report.violations.map((item) => item.code))
      .toContain("ACTOR_NOT_IN_QUERY_KEY");
  });

  it("requires account-transition observation rather than including actorId once", () => {
    const result = runFixture({
      [court]: `
        function Workspace({ actorId }) {
          return useQuery({
            queryKey: ["world", "court", "workspace", actorId],
            queryFn: fetchCourt,
          });
        }
      `,
    });
    expect(result.status).toBe(1);
    expect(result.report.violations.map((item) => item.code))
      .toContain("AUTH_TRANSITION_UNOBSERVED");
  });

  it("fails closed on computed, non-inspectable query keys", () => {
    const result = runFixture({
      [court]: `
        function Workspace({ actorId }) {
          supabase.auth.onAuthStateChange(() => {});
          return useQuery({
            queryKey: privateKeyFor("court", actorId),
            queryFn: fetchCourt,
          });
        }
      `,
    });
    expect(result.status).toBe(1);
    expect(result.report.violations.map((item) => item.code))
      .toContain("NON_LITERAL_QUERY_KEY");
  });

  it("accepts identity-keyed room data and an isolated auth-generation court cache", () => {
    const result = runFixture({
      [privateRoom]: `
        function Rooms({ identity }) {
          supabase.auth.onAuthStateChange(() => {});
          const self = useQuery({
            queryKey: ["world-private-identity"],
            queryFn: readCurrentIdentity,
          });
          const rooms = useQuery({
            queryKey: [...PRIVATE_WORLD_QUERY_ROOT, identity.data, "rooms"],
            enabled: Boolean(identity.data), queryFn: readPrivateRooms,
          });
          return [self, rooms];
        }
      `,
      WorldCourtJudgments.tsx: `
        function Court({ caseId, authGeneration }) {
          supabase.auth.onAuthStateChange(() => {});
          return useQuery({
            queryKey: ["world", "court", "judgments", caseId, authGeneration],
            queryFn: readJudgments,
          });
        }
      `,
    });
    expect(result.status).toBe(0);
    expect(result.report.violations).toEqual([]);
    expect(result.report.inspected).toHaveLength(2);
    expect(result.report.absent).toContain(mediation);
    expect(result.report.proof).toBe("SOURCE_ONLY_NOT_RUNTIME_AUTHORIZATION_OR_RELEASE_CERTIFICATION");
  });

  it("ignores auth-boundary cache invalidations while checking actual data reads", () => {
    const result = runFixture({
      [privateRoom]: `
        function PrivateWorkspace({ identity }) {
          supabase.auth.onAuthStateChange(() => {
            queryClient.removeQueries({ queryKey: PRIVATE_WORLD_QUERY_ROOT });
          });
          queryClient.invalidateQueries({
            queryKey: [...PRIVATE_WORLD_QUERY_ROOT, "organizations"],
          });
          return useInfiniteQuery({
            queryKey: [...PRIVATE_WORLD_QUERY_ROOT, identity.data, "messages"],
            enabled: Boolean(identity.data),
            queryFn: fetchPrivateMessages,
          });
        }
      `,
    });
    expect(result.status).toBe(0);
    expect(result.report.violations).toEqual([]);
  });

  it("accepts the actual WORLD-08 TG13 current-actor/epoch hook and scoped query", () => {
    const result = runFixture({
      [mediation]: `
        import { useTg13PrivateActor } from "@/lib/world-tg13-private-session";
        function Workspace() {
          const actor = useTg13PrivateActor();
          return useQuery({
            queryKey: ["world", "mediation", "workspace", actor.userId, actor.epoch],
            enabled: actor.ready && !!actor.userId,
            queryFn: () => fetchMediationWorkspace(actor.userId),
          });
        }
      `,
    });
    expect(result.status).toBe(0);
    expect(result.report.violations).toEqual([]);
  });

  it("rejects stale placeholder data that could retain another actor's private records", () => {
    const result = runFixture({
      [mediation]: `
        function Workspace({ actorId }) {
          supabase.auth.onAuthStateChange(() => {});
          return useQuery({
            queryKey: ["world", "mediation", "workspace", actorId],
            placeholderData: previous => previous,
            queryFn: fetchWorkspace,
          });
        }
      `,
    });
    expect(result.status).toBe(1);
    expect(result.report.violations.map((item) => item.code))
      .toContain("STALE_PRIVATE_FALLBACK");
  });

  it("audits checked-out source without certifying absent unmerged files", () => {
    const result = spawnSync(
      process.execPath, [script, "--root", process.cwd(), "--json"],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(result.error).toBeUndefined();
    const report = JSON.parse(result.stdout) as Report;
    expect(report.inspected.length + report.absent.length).toBe(5);
    expect(report.proof).toBe("SOURCE_ONLY_NOT_RUNTIME_AUTHORIZATION_OR_RELEASE_CERTIFICATION");
    expect(report.violations).toEqual([]);
    expect(result.status).toBe(0);
  });
});
