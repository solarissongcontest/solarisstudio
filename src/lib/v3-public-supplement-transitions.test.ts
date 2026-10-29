import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve("scripts/check-v3-capability-status-transitions.ts");
const primary = "src/lib/v3-public-capability-registry.ts";
const supplement = "src/lib/v3-public-capability-supplements.ts";
const organizer = "src/lib/v3-organizer-capability-registry.ts";
const row = (status: string) => `  {\n    id: "supplement",\n    classification: "restrict",\n    specificationStatus: "${status}",\n  },\n`;

function fixture(run: (directory: string, base: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "public-supplement-transition-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8" });
  try {
    mkdirSync(join(directory, "src/lib"), { recursive: true });
    writeFileSync(join(directory, primary), "");
    writeFileSync(join(directory, supplement), row("parity"));
    writeFileSync(join(directory, organizer), readFileSync(organizer, "utf8"));
    git("init", "-q");
    git("add", "src");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@local.invalid", "commit", "-qm", "Initial capability state");
    run(directory, git("rev-parse", "HEAD").trim());
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function check(directory: string, base: string) {
  return spawnSync(process.execPath, ["--env-file=/dev/null", "run", script], {
    cwd: directory, encoding: "utf8", env: { ...process.env, V3_STATUS_BASE_REF: base },
  });
}

describe("Public supplement transition history", () => {
  it("rejects backward status changes in discovered capabilities", () => fixture((directory, base) => {
    writeFileSync(join(directory, supplement), row("building"));
    const result = check(directory, base);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Public supplement: backward status transition parity -> building");
  }));

  it("rejects silent removal from the combined canonical inventory", () => fixture((directory, base) => {
    writeFileSync(join(directory, supplement), "");
    const result = check(directory, base);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Public supplement: capability row disappeared");
  }));

  it("rejects a forward transition without exact-tree acceptance evidence", () => fixture((directory, base) => {
    writeFileSync(join(directory, supplement), row("cutover"));
    const result = check(directory, base);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cannot be accepted without exact-tree evidence");
  }));

  it("preserves history when a capability moves between canonical source files", () => fixture((directory, base) => {
    writeFileSync(join(directory, supplement), "");
    writeFileSync(join(directory, primary), row("parity"));
    expect(check(directory, base).status).toBe(0);
  }));
});
