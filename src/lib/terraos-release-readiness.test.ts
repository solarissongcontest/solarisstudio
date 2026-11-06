import { describe, expect, it } from "vitest";
import { getTerraOsPublicReadiness } from "./terraos-release-readiness";

const PUBLIC_KEYS = ["percent", "stage"] as const;
const SENSITIVE_VALUE_PATTERNS = [
  /\b[0-9a-f]{40}\b/i,
  /\b(?:pr|pull request)\s*#?\d+\b/i,
  /https?:\/\/github\.com\/[^/\s"']+\/[^/\s"']+\/(?:pull|actions\/runs)\/\d+/i,
  /https?:\/\/[^/\s"']+\.supabase\.co\b/i,
] as const;

function assertSafePublicReadiness(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("public readiness must be an object");
  }

  const readiness = value as Record<string, unknown>;
  const keys = Object.keys(readiness).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...PUBLIC_KEYS].sort())) {
    throw new Error(`unexpected public readiness fields: ${keys.join(", ")}`);
  }
  if (typeof readiness.percent !== "number" || !Number.isFinite(readiness.percent)) {
    throw new Error("public readiness percent must be finite");
  }
  if (typeof readiness.stage !== "string" || readiness.stage.length === 0) {
    throw new Error("public readiness stage must be non-empty");
  }

  const serialized = JSON.stringify(readiness);
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    if (pattern.test(serialized)) throw new Error(`sensitive readiness value matched ${pattern}`);
  }
}

describe("TerraOS public readiness projection", () => {
  it("returns only the sanitized public readiness shape", () => {
    const readiness = getTerraOsPublicReadiness();

    assertSafePublicReadiness(readiness);
    expect(readiness.percent).toBeGreaterThanOrEqual(0);
    expect(readiness.percent).toBeLessThanOrEqual(98);
    expect(readiness.stage.length).toBeGreaterThan(0);
  });

  it("allows valid user-facing stage language such as taking shape", () => {
    expect(() => assertSafePublicReadiness({
      percent: 52,
      stage: "Core experience taking shape",
    })).not.toThrow();
  });

  it.each([
    "sha",
    "candidateSha",
    "commit",
    "deployment",
    "database",
    "migration",
    "workflow",
    "blockers",
    "registry",
  ])("rejects leaked internal metadata field %s", (field) => {
    const readiness = getTerraOsPublicReadiness();
    expect(() => assertSafePublicReadiness({ ...readiness, [field]: "internal" })).toThrow(
      /unexpected public readiness fields/,
    );
  });

  it("rejects real implementation identifiers embedded in public values", () => {
    expect(() => assertSafePublicReadiness({
      percent: 52,
      stage: `candidate ${"a".repeat(40)}`,
    })).toThrow(/sensitive readiness value/);
    expect(() => assertSafePublicReadiness({
      percent: 52,
      stage: "tracked in PR #1400",
    })).toThrow(/sensitive readiness value/);
    expect(() => assertSafePublicReadiness({
      percent: 52,
      stage: "https://secret-project.supabase.co",
    })).toThrow(/sensitive readiness value/);
  });
});
