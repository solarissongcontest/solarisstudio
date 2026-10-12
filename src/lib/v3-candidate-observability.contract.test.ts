import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-candidate-observability.ts"),
    "utf8",
  );

describe("Solaris Studio V3 candidate observability architecture", () => {
  it("extends #499 instead of redefining its event or threshold model", () => {
    const candidate = source();
    expect(candidate).toContain('from "./v3-rollout-observability"');
    expect(candidate).toContain("createV3ObservabilityEvent");
    expect(candidate).toContain("V3ObservabilityEvaluation");
    expect(candidate).not.toContain("maxBootstrapFailureRate");
    expect(candidate).not.toContain("minCriticalOperationSamples");
  });

  it("separates stable deployment identity from rollout-policy observation identity", () => {
    const candidate = source();
    expect(candidate).toContain("V3RuntimeDeploymentIdentity");
    expect(candidate).toContain("V3RuntimeObservationIdentity");
    expect(candidate).toContain("v3RuntimeDeploymentIdentityKey");
    expect(candidate).toContain("v3RuntimeObservationIdentityKey");
    expect(candidate).toContain("This deliberately excludes rollout-policy revision");
    expect(candidate).toContain("Policy changes therefore create a new telemetry");
  });

  it("keeps rollout policy out of deployment identity but inside observation identity", () => {
    const candidate = source();
    const deploymentType = candidate.slice(
      candidate.indexOf("export type V3RuntimeDeploymentIdentity"),
      candidate.indexOf("export type V3RuntimeObservationIdentity"),
    );
    expect(deploymentType).not.toContain("rolloutPolicyUpdatedAt");
    expect(candidate).toContain("rolloutPolicyUpdatedAt: string");
    expect(candidate).toContain("observationIdentityKey");
  });

  it("keeps runtime identity outside low-cardinality product event metadata", () => {
    const candidate = source();
    expect(candidate).toContain("Identity remains outside the event metadata contract");
    expect(candidate).not.toContain("event.metadata.candidateSha");
    expect(candidate).not.toContain("event.metadata.deploymentRef");
    expect(candidate).not.toContain("event.metadata.rolloutPolicyUpdatedAt");
  });

  it("requires exact deployment and observation scope aggregation", () => {
    const candidate = source();
    expect(candidate).toContain("persistDeploymentIdentityKey: true");
    expect(candidate).toContain("persistObservationIdentityKey: true");
    expect(candidate).toContain("aggregateByExactDeploymentIdentity: true");
    expect(candidate).toContain("aggregateByExactObservationIdentity: true");
    expect(candidate).toContain("different deployed runtime candidate");
    expect(candidate).toContain("different rollout-policy observation scope");
  });

  it("prevents a window from crossing backward over a rollout-policy revision", () => {
    const candidate = source();
    expect(candidate).toContain("rolloutPolicyUpdatedAt");
    expect(candidate).toContain(
      "Observation window cannot start before this rollout-policy revision became authoritative",
    );
  });

  it("does not claim the existing Public UX transport is schema-compatible", () => {
    const candidate = source();
    expect(candidate).toContain("currentPublicUxAllowlistReady: false");
    expect(candidate).toContain("generated and rehearsed with isolated local Supabase");
  });

  it("cannot own telemetry writes, database queries, browser state or polling", () => {
    const candidate = source();
    for (const forbidden of [
      "@supabase",
      "createClient(",
      "supabase.",
      ".from(",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "useEffect(",
      "useQuery(",
      "useMutation(",
      "setInterval(",
      "setTimeout(",
    ]) {
      expect(candidate).not.toContain(forbidden);
    }
  });

  it("never manufactures runtime identity or observation time", () => {
    const candidate = source();
    expect(candidate).not.toContain("Date.now(");
    expect(candidate).not.toContain("new Date(");
    expect(candidate).not.toContain("randomUUID");
    expect(candidate).not.toContain("crypto.randomUUID");
  });

  it("uses the rollout stage that actually generated evidence for each promotion", () => {
    const candidate = source();
    expect(candidate).toContain('case "limited"');
    expect(candidate).toContain('return "shadow"');
    expect(candidate).toContain('case "full"');
    expect(candidate).toContain('return "limited"');
    expect(candidate).toContain('case "retire_legacy"');
    expect(candidate).toContain('return "full"');
  });
});
