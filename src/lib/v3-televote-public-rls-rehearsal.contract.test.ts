import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const deltaRunner = resolve(".github/scripts/v3-copy-migration-delta.sh");
const rlsRunner = resolve(".github/scripts/v3-televote-public-rls-rehearsal.sh");

describe("Televote upgrade verification", () => {
  it("copies the entire additive delta, including later security migrations, without deleting main history", () => {
    const root = mkdtempSync(join(tmpdir(), "solaris-tv-delta-"));
    try {
      const source = join(root, "source");
      const target = join(root, "target");
      const migrations = "supabase/migrations";
      mkdirSync(join(source, migrations), { recursive: true });
      mkdirSync(join(target, migrations), { recursive: true });
      const git = (...args: string[]) =>
        execFileSync("git", ["-C", source, ...args], { stdio: "pipe" });
      git("init", "--initial-branch=main");
      git("config", "user.name", "Local test");
      git("config", "user.email", "test@local.invalid");
      writeFileSync(join(source, migrations, "20261017001000_foundation.sql"), "select 1;\n");
      git("add", ".");
      git("commit", "-m", "baseline");
      git("branch", "baseline");
      writeFileSync(join(target, migrations, "20261017001000_foundation.sql"), "select 1;\n");
      writeFileSync(join(target, migrations, "20261024000000_main_only.sql"), "select 2;\n");
      const additions = ["20261017001010_repair.sql", "20261024153000_public_rls.sql"];
      for (const name of additions)
        writeFileSync(join(source, migrations, name), `-- ${name}\nselect 3;\n`);
      git("add", ".");
      git("commit", "-m", "complete delta");
      execFileSync("bash", [deltaRunner, source, target, "baseline"], { stdio: "pipe" });
      for (const name of additions) {
        expect(readFileSync(join(target, migrations, name), "utf8")).toBe(
          readFileSync(join(source, migrations, name), "utf8"),
        );
      }
      expect(readFileSync(join(target, migrations, "20261024000000_main_only.sql"), "utf8")).toBe(
        "select 2;\n",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a hosted DB_URL before starting psql", () => {
    const root = mkdtempSync(join(tmpdir(), "solaris-tv-isolation-"));
    try {
      writeFileSync(
        join(root, "supabase"),
        "#!/bin/sh\nprintf '%s\\n' 'DB_URL=postgresql://postgres:postgres@hosted.invalid:5432/postgres'\n",
        { mode: 0o755 },
      );
      writeFileSync(join(root, "psql"), "#!/bin/sh\necho 'PSQL_MUST_NOT_RUN'\nexit 9\n", {
        mode: 0o755,
      });
      const result = spawnSync("bash", [rlsRunner], {
        env: { ...process.env, PATH: `${root}:${process.env.PATH}` },
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Refusing non-local Televote RLS rehearsal");
      expect(result.stdout).not.toContain("PSQL_MUST_NOT_RUN");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
