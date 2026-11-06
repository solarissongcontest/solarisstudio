import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public Records authoritative-read recovery", () => {
  it("never mounts legacy archive data for an unverified initial Records read", () => {
    const gate = read("src/components/v3/V3RecordsGate.tsx");

    const errorBranch = gate.indexOf("if (loading || unavailable)");
    const disabledBranch = gate.indexOf(
      "if (rollout.data.enabled !== true || rollout.data.resultsEnabled !== true)",
    );
    expect(errorBranch).toBeGreaterThan(-1);
    expect(disabledBranch).toBeGreaterThan(errorBranch);
    expect(gate).toContain(
      "const unavailable = bundle.isError || !bundle.data || rollout.isError || !rollout.data",
    );
    expect(gate).toContain('data-v3-records-authority-unavailable={!loading');
    expect(gate).toContain("No current-edition records are shown");
    expect(gate.match(/return <>{fallback}<\/>;/g)?.length).toBe(1);
  });

  it("supports bounded manual recovery without new querying or polling", () => {
    const gate = read("src/components/v3/V3RecordsGate.tsx");
    const runtime = read("src/lib/v3-records-runtime.ts");

    expect(gate).toContain("const retrying = bundle.isFetching || rollout.isFetching");
    expect(gate).toContain("disabled={retrying}");
    expect(gate).toContain("if (bundle.isError || !bundle.data) void bundle.refetch()");
    expect(gate).toContain("else void rollout.refetch()");
    expect(gate).toContain("Retry official Records");
    expect(gate).toContain("Retrying Records…");
    expect(gate).not.toContain("useAllResults(");
    expect(gate).not.toContain("useAllJuryVotes(");
    expect(gate).not.toContain("setInterval(");
    expect(runtime).toContain("retry: false");
  });

  it("preserves the exact published archive and account-scoped spoiler controls", () => {
    const gate = read("src/components/v3/V3RecordsGate.tsx");
    const route = read("src/routes/records/index.tsx");

    expect(gate).toContain("resolveV3ResultsSpoilerProtection({");
    expect(gate).toContain("serverPending: serverPreferences.isPending");
    expect(gate).toContain("serverError: serverPreferences.isError");
    expect(gate).toContain("bundle.data.spoilerSafeRecords");
    expect(gate).toContain("setRevealedScope(null)");
    expect(gate).toContain("setRevealedScope(revealScope)");
    expect(gate).toContain("rollout.data.resultsEnabled !== true");
    expect(gate).toContain("return <>{fallback}</>");
    expect(route).toContain("isAppMode");
    expect(route).toContain("LegacyRecordsPage");
  });

  it("never transfers revealed results to another viewer on the same edition", () => {
    const gate = read("src/components/v3/V3RecordsGate.tsx");
    expect(gate).toContain("const revealScope = JSON.stringify([");
    expect(gate).toContain('rollout.data?.userId ?? "anonymous"');
    expect(gate).toContain('bundle.data?.currentEditionId ?? "none"');
    expect(gate).toContain("const currentEditionRevealed = revealedScope === revealScope");
    expect(gate).toContain("[rollout.data?.userId, bundle.data?.currentEditionId]");
    expect(gate).toContain("!currentEditionRevealed");
    expect(gate).not.toContain("useState(false)");
  });
});
