import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const envExample = readFileSync(".env.example", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const guardedClientSources = [
  "src/integrations/supabase/client.ts",
  "src/integrations/supabase/client.server.ts",
  "src/integrations/supabase/organizer.server.ts",
  "src/integrations/supabase/auth-middleware.ts",
  "src/integrations/televoting/client.ts",
  "src/integrations/televoting/public.server.ts",
  "src/integrations/confirmations/public-runtime.server.ts",
  "src/lib/integrity-portal.ts",
  "src/lib/integrity.functions.ts",
  "src/routes/sitemap[.]xml.ts",
] as const;

function trackedEnvironmentFiles() {
  const tracked = execFileSync("git", ["ls-files", "--", ".env", ".env.*"], {
    encoding: "utf8",
  })
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);

  return tracked.filter((path) => path !== ".env.example");
}

describe("V3 repository environment isolation", () => {
  it("does not track runtime environment files that Vite could auto-load", () => {
    expect(trackedEnvironmentFiles()).toEqual([]);
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });

  it("keeps the local-development template loopback-only", () => {
    expect(envExample).toContain('VITE_SUPABASE_URL="http://127.0.0.1:54321"');
    expect(envExample).toContain('SUPABASE_URL="http://127.0.0.1:54321"');
    expect(envExample).toContain('VITE_SUPABASE_PROJECT_ID="local"');
    expect(envExample).toContain('SUPABASE_PROJECT_ID="local"');
    expect(envExample).not.toContain(".supabase.co");
    expect(envExample).not.toContain("dkxmnvekiopyesuzggeu");
  });

  it.each(guardedClientSources)(
    "keeps %s wired through the non-production target guard",
    (path) => {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("assertNonProductionSupabaseTarget");
      expect(source).toMatch(/assertNonProductionSupabaseTarget\(/);
    },
  );
});
