import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("auth subscriber lifecycle audit", () => {
  it("guards every owned auth subscriber and keeps settings on the shared session cache", () => {
    const preferenceSync = source("src/components/app/AppExperiencePreferenceSync.tsx");
    const accountIsolation = source("src/components/app/AccountCacheIsolation.tsx");
    const accountCache = source("src/lib/account-cache-isolation.ts");
    const appShell = source("src/components/AppShell.tsx");
    const settings = source("src/routes/settings.tsx");
    const notifications = source("src/components/mysolaris/MySolarisNotificationsPanel.tsx");
    const passwordReset = source("src/routes/auth/reset.tsx");
    const authenticatedRoute = source("src/routes/_authenticated/route.tsx");

    expect(preferenceSync).toContain("beginLifecycleGeneration(authGenerationRef)");
    expect(preferenceSync).toContain("lifecycle.isCurrent()");
    expect(accountIsolation).toContain("beginLifecycleGeneration(authGenerationRef)");
    expect(accountIsolation).toContain("createAccountCacheIsolationHandler");
    expect(accountIsolation).toContain("lifecycle.deactivate()");
    expect(accountCache).toContain('client.setQueryData(["fan-session"]');
    expect(accountCache).toContain("clearPrivateAccountQueries(client)");
    expect(appShell).toContain("if (!alive || generation !== authGeneration) return;");
    expect(appShell).toContain("if (alive && generation === authGeneration) setAccess(next);");
    expect(appShell.indexOf("setAccess(EMPTY_ACCESS)")).toBeLessThan(appShell.indexOf("await getCurrentAccountAccess(userId)"));
    expect(settings).toContain("useFanSession");
    expect(settings).not.toContain("supabase.auth.onAuthStateChange");
    expect(settings).not.toContain("supabase.auth.getUser");
    expect(notifications).toContain("useFanSession");
    expect(notifications).not.toContain("supabase.auth.getUser");
    expect(passwordReset).toContain("if (!mounted) return;");
    expect(authenticatedRoute).not.toContain("beforeLoad:");
    expect(authenticatedRoute).not.toContain("onAuthStateChange");
    expect(authenticatedRoute).toContain("useQuery<User | null>");
    expect(authenticatedRoute).toContain("await supabase.auth.getUser()");
    expect(authenticatedRoute).toContain("queryKey: authenticatedIdentityQueryKey(sessionUserId)");
    expect(authenticatedRoute).toContain("const session = useFanSession()");
    expect(authenticatedRoute).toContain("data.user.id !== sessionUserId");
    expect(authenticatedRoute).toContain("enabled: Boolean(sessionUserId)");
    expect(authenticatedRoute).toContain("retry: false");
  });
});
