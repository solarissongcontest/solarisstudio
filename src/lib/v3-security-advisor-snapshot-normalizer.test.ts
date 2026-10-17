import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function runNormalizer(raw: unknown) {
  const root = mkdtempSync(join(tmpdir(), "v3-security-advisor-"));
  roots.push(root);
  const input = join(root, "raw.json");
  const output = join(root, "snapshot.json");
  writeFileSync(input, `${JSON.stringify(raw, null, 2)}\n`);
  execFileSync("bun", ["run", "scripts/normalize-v3-security-advisor-snapshot.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      V3_SECURITY_ADVISOR_RAW: input,
      V3_SECURITY_ADVISOR_PROJECT_REF: "candidate-project",
      V3_SECURITY_ADVISOR_SNAPSHOT: output,
    },
    stdio: "pipe",
  });
  return JSON.parse(readFileSync(output, "utf8")) as {
    schemaVersion: number;
    projectRef: string;
    findings: Array<{
      id: string;
      level: string;
      title: string;
      object?: string;
      detail: string;
    }>;
  };
}

const lints = [
  {
    name: "anon_security_definer_function_executable",
    title: "Public Can Execute SECURITY DEFINER Function",
    level: "warn",
    findings: [
      {
        detail: "Function public.example(p_id uuid) is callable by anon",
        metadata: {
          arguments: "p_id uuid",
          language: "plpgsql",
          name: "example",
          schema: "public",
          security_definer: true,
        },
        observed_at: "2026-10-17T12:53:37.777Z",
      },
    ],
  },
  {
    name: "auth_leaked_password_protection",
    title: "Leaked Password Protection Disabled",
    level: "WARN",
    findings: [
      {
        detail: "Enable leaked password protection.",
        metadata: { entity: "Auth", type: "auth" },
      },
    ],
  },
];

describe("V3 Supabase security advisor snapshot normalization", () => {
  it("flattens connector-style payloads into the canonical release-evidence snapshot", () => {
    const snapshot = runNormalizer({ text: JSON.stringify({ result: { lints } }) });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.projectRef).toBe("candidate-project");
    expect(snapshot.findings).toHaveLength(2);
    expect(snapshot.findings.map((finding) => finding.level)).toEqual(["WARN", "WARN"]);
    expect(snapshot.findings.find((finding) => finding.object?.startsWith("public.example"))?.object).toBe(
      "public.example(p_id uuid)",
    );
    expect(snapshot.findings.find((finding) => finding.object === "Auth")).toBeTruthy();
    for (const finding of snapshot.findings) {
      expect(finding.id).toMatch(/^[a-z0-9_]+:[0-9a-f]{20}$/);
      expect(finding.detail.length).toBeGreaterThan(0);
    }
  });

  it("keeps finding ids stable when advisor ordering and metadata key ordering change", () => {
    const first = runNormalizer({ result: { lints } });
    const reordered = runNormalizer({
      lints: [...lints]
        .reverse()
        .map((lint) => ({
          ...lint,
          findings: [...lint.findings].reverse().map((finding) => ({
            ...finding,
            metadata: Object.fromEntries(Object.entries(finding.metadata).reverse()),
          })),
        })),
    });

    expect(reordered.findings.map((finding) => finding.id)).toEqual(
      first.findings.map((finding) => finding.id),
    );
  });
});
