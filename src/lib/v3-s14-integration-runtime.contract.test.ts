import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("S14 integration runtime regression isolation", () => {
  it.each([
    ["https://hosted.invalid", "postgresql://postgres:postgres@localhost:54322/postgres"],
    ["http://127.0.0.1:54321", "postgresql://postgres:postgres@hosted.invalid:5432/postgres"],
    ["", ""],
  ])("rejects non-local or missing API/DB targets before psql (%s)", (api, db) => {
    const dir = mkdtempSync(join(tmpdir(), "s14-integration-isolation-"));
    try {
      writeFileSync(join(dir, "supabase"), `#!/bin/sh\nprintf '%s\\n' 'API_URL=${api}' 'DB_URL=${db}'\n`, { mode: 0o755 });
      writeFileSync(join(dir, "psql"), "#!/bin/sh\necho UNSAFE_PSQL_EXECUTED\n", { mode: 0o755 });
      let output = "";
      try {
        output = execFileSync("bash", [".github/scripts/v3-s14-integration-runtime-regression.sh"], {
          env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, encoding: "utf8", stdio: "pipe",
        });
      } catch (error) {
        const failure = error as { status: number; stdout: string; stderr: string };
        expect(failure.status).not.toBe(0);
        output = `${failure.stdout}${failure.stderr}`;
      }
      expect(output).toContain("Refusing integration runtime regression against a non-local target");
      expect(output).not.toContain("UNSAFE_PSQL_EXECUTED");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
