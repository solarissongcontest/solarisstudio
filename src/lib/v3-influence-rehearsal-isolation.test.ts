import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("influence ACL disposable stack isolation", () => {
  it("avoids the proven mail UI port collision while preserving unrelated settings, idempotently", () => {
    const dir = mkdtempSync(join(tmpdir(), "influence-isolation-"));
    const path = join(dir, "config.toml");
    try {
      for (const input of [
        'project_id = "local"\n[db]\nport = 54322\n',
        'project_id = "local"\n[inbucket]\nport = 54324\nsmtp_port = 54325\n[db]\nport = 54322\n',
        'project_id = "local"\n[inbucket]\nsmtp_port = 54325\n[db]\nport = 54322\n',
      ]) {
        writeFileSync(path, input);
        const run = () => execFileSync("python", [".github/scripts/prepare-influence-local-config.py", path]);
        run();
        const result = readFileSync(path, "utf8");
        expect(result).toContain("port = 55324");
        expect(result).toContain('[db]\nport = 54322');
        expect(result).toContain('project_id = "local"');
        expect(result).not.toContain("port = 54324");
        if (input.includes("smtp_port")) expect(result).toContain("smtp_port = 54325");
        run();
        expect(readFileSync(path, "utf8")).toBe(result);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("checks both loopback targets before resetting and testing either migration mode", () => {
    const source = readFileSync(".github/workflows/v3-televote-influence-runtime-access.yml", "utf8");
    expect(source.indexOf('prepare-influence-local-config.py" supabase/config.toml')).toBeLessThan(source.indexOf("supabase start"));
    expect(source.indexOf('case "$API_URL"')).toBeLessThan(source.indexOf("supabase db reset --local"));
    expect(source.indexOf('case "$DB_URL"')).toBeLessThan(source.indexOf("supabase db reset --local"));
    expect(source.match(/case "\$API_URL"/g)).toHaveLength(2);
    expect(source).toContain("Refusing non-local database");
    expect(source).toContain("supabase migration up --local");
  });
});
