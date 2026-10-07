import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("auth subscriber lifecycle audit", () => {
  it("guards every known auth subscriber before publishing lifecycle work", () => {
    const preferenceSync = source("src/components/app/AppExperiencePreferenceSync.tsx");
    const accountIsolation = source("src/components/app/AccountCacheIsolation.tsx");
    const appShell = source("src/components/AppShell.tsx");
    const settings = source("src/routes/settings.tsx");
    const passwordReset = source("src/routes/auth/reset.tsx");

    expect(preferenceSync).toContain("beginLifecycleGeneration(authGenerationRef)");
    expect(preferenceSync).toContain("lifecycle.isCurrent()");
    expect(accountIsolation).toContain("beginLifecycleGeneration(authGenerationRef)");
    expect(accountIsolation).toContain("lifecycle.deactivate()");
    expect(appShell).toContain("if (!alive) return;");
    expect(appShell).toContain("if (alive) setAccess(next);");
    expect(settings).toContain("if (alive) setUserId");
    expect(passwordReset).toContain("if (!mounted) return;");
  });
});
