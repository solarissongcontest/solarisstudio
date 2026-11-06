import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const envExample = readFileSync(".env.example", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const wrangler = readFileSync("wrangler.jsonc", "utf8");
const targetSafety = readFileSync("src/lib/supabase-target-safety.ts", "utf8");
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

describe("V3 repository environment isolation", () => {
  it("prevents new local environment variants from being committed by default", () => {
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

  it("marks only the canonical Worker deployment as production runtime", () => {
    expect(wrangler).toContain('"SOLARIS_RUNTIME_ENV": "production"');
    expect(targetSafety).toContain('"studio.solaris-song-contest.workers.dev"');
    expect(targetSafety).toContain('runtimeEnv === "production"');
    expect(targetSafety).not.toContain('mode === "production"');
  });

  it.each(guardedClientSources)(
    "keeps %s wired through the hosted-target guard",
    (path) => {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("assertNonProductionSupabaseTarget");
      expect(source).toMatch(/assertNonProductionSupabaseTarget\(/);
    },
  );
});
