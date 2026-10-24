import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const envExample = readFileSync(".env.example", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");

function trackedRootEnv() {
  return execFileSync("git", ["ls-files", "--", ".env"], {
    encoding: "utf8",
  }).trim();
}

describe("V3 repository environment isolation", () => {
  it("does not track a root .env that Vite could auto-load", () => {
    expect(trackedRootEnv()).toBe("");
    expect(gitignore).toMatch(/^\.env$/m);
  });

  it("keeps the local-development template loopback-only", () => {
    expect(envExample).toContain('VITE_SUPABASE_URL="http://127.0.0.1:54321"');
    expect(envExample).toContain('SUPABASE_URL="http://127.0.0.1:54321"');
    expect(envExample).toContain('VITE_SUPABASE_PROJECT_ID="local"');
    expect(envExample).toContain('SUPABASE_PROJECT_ID="local"');
    expect(envExample).not.toContain(".supabase.co");
    expect(envExample).not.toContain("dkxmnvekiopyesuzggeu");
  });
});
