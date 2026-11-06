import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const guard = fileURLToPath(new URL("../check-v3-capability-status-transitions.ts", import.meta.url));
const publicRegistry = `export const PUBLIC = [
  { id: "home", classification: "redesign", specificationStatus: "parity" },
];`;

function organizerRegistry(options: { includeAccess?: boolean; accessStatus?: string; accessClass?: string } = {}) {
  const includeAccess = options.includeAccess !== false;
  const accessStatus = options.accessStatus ?? "parity";
  const accessClass = options.accessClass ?? "restrict";
  return `export const V3_ORGANIZER_CLASSIFICATION_BY_ID = {
  "voting-jury": "redesign",
  ${includeAccess ? `"delegation-access": "${accessClass}",` : ""}
} as const satisfies Record<string, V3MigrationClassification>;

function migrationStatusFor(id: string): AdminCapabilityMigration["migrationStatus"] {
  if (id === "voting-jury") return "parity";
  ${includeAccess ? `if (id === "delegation-access") return "${accessStatus}";` : ""}
  return "planned";
}
function targetRouteFor(id: string) { return "/"; }
`;
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function runTransitionGuard(after: string, afterPublic = publicRegistry) {
  const root = mkdtempSync(join(tmpdir(), "v3-status-registry-"));
  const lib = join(root, "src/lib");
  try {
    mkdirSync(lib, { recursive: true });
    git(root, "init", "-q");
    git(root, "config", "user.email", "qa-fixture@example.invalid");
    git(root, "config", "user.name", "V3 QA Test");
    const organizerPath = join(lib, "v3-organizer-capability-registry.ts");
    const publicPath = join(lib, "v3-public-capability-registry.ts");
    writeFileSync(organizerPath, organizerRegistry());
    writeFileSync(publicPath, publicRegistry);
    git(root, "add", "src/lib");
    git(root, "commit", "-qm", "baseline registries");
    const baseRef = git(root, "rev-parse", "HEAD");
    writeFileSync(organizerPath, after);
    writeFileSync(publicPath, afterPublic);
    // The actual shipped guard runs via Bun in Quality CI. No database or network.
    const result = spawnSync("bun", ["run", guard], {
      cwd: root,
      env: { ...process.env, V3_STATUS_BASE_REF: baseRef },
      encoding: "utf8",
      timeout: 15_000,
    });
    if (result.error) throw result.error;
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("S15 capability status history is fail-closed", () => {
  it("rejects an Organizer capability removed from the canonical registry", () => {
    const result = runTransitionGuard(organizerRegistry({ includeAccess: false }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("Organizer delegation-access: capability row disappeared");
  });

  it("permits a retained capability to progress from parity to cutover", () => {
    const result = runTransitionGuard(organizerRegistry({ accessStatus: "cutover" }));
    expect(result.status).toBe(0);
    expect(result.output).toContain("PASS against");
  });

  it("permits explicit retirement without deleting the capability", () => {
    const result = runTransitionGuard(organizerRegistry({ accessStatus: "retired", accessClass: "retire" }));
    expect(result.status).toBe(0);
  });

  it("rejects backward Organizer capability transitions", () => {
    const result = runTransitionGuard(organizerRegistry({ accessStatus: "building" }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("backward status transition parity -> building");
  });

  it("continues rejecting a deleted Public capability", () => {
    const result = runTransitionGuard(
      organizerRegistry(),
      `export const PUBLIC = [{ id: "unrelated", classification: "redesign", specificationStatus: "parity" }];`,
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain("Public home: capability row disappeared");
  });
});
