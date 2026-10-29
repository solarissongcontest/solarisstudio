import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  isResolvedV3DomainConsequence,
  isV3ReadOnlyConsequenceReplacement,
} from "./v3-domain-consequence-registry";

function dashboard() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const result = spawnSync(process.execPath, ["--env-file=/dev/null", "run", "scripts/generate-v3-completion-dashboard.ts", "--json"], {
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GITHUB_SHA: sha, V3_CANDIDATE_SHA: sha },
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe("consequence dashboard uses canonical implementation truth", () => {
  it("does not count a validated read replacement as an unresolved mutating consequence", () => {
    const report = dashboard();
    const unresolved = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((row) => !isResolvedV3DomainConsequence(row));
    const s5 = report.system.find((row: { id: string }) => row.id === "S5");
    expect(s5.blocker).toBe(unresolved.length ? `${unresolved.length} consequences are still declaration-only` : undefined);
    expect(s5.state === "integrated").toBe(unresolved.length === 0);
  });

  it("keeps actual event delivery and validated read replacement evidence separate", () => {
    const report = dashboard();
    expect(report.registrySummary.eventBackedConsequences).toBe(V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((row) => row.implementationState === "event-backed").length);
    expect(report.registrySummary.readOnlyReplacements).toBe(V3_DOMAIN_CONSEQUENCE_REGISTRY.filter(isV3ReadOnlyConsequenceReplacement).length);
    expect(report.registrySummary.resolvedConsequences).toBe(V3_DOMAIN_CONSEQUENCE_REGISTRY.filter(isResolvedV3DomainConsequence).length);
    expect(report.registrySummary.unresolvedConsequences).toBe(V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((row) => !isResolvedV3DomainConsequence(row)).length);
  });
});
