import { expect, test, type BrowserContext } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
};

async function addSession(
  context: BrowserContext,
  url: string,
  publishableKey: string,
  email: string,
  password: string,
): Promise<E2ESession> {
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.ok, "The local Search audit account must be able to sign in").toBeTruthy();
  const session = (await response.json()) as E2ESession;
  const projectRef = new URL(url).hostname.split(".")[0];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${projectRef}-auth-token`, value: session },
  );
  return session;
}

async function enableInstalledAppMode(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
    localStorage.setItem("solaris:app-first-run-complete:v1", "1");

    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query === "(display-mode: standalone)") {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return originalMatchMedia(query);
    }) as typeof window.matchMedia;
  });
}

async function setFeature(
  url: string,
  publishableKey: string,
  session: E2ESession,
  key: string,
  enabled: boolean,
) {
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/studio2_set_feature_flag`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_key: key,
      p_enabled: enabled,
      p_admins_only: false,
      p_user_ids: enabled ? [session.user.id] : [],
      p_edition_ids: [],
    }),
  });
  const body = await response.text();
  expect(response.ok, `Local ${key} rollout mutation must succeed: ${body}`).toBeTruthy();
}

test.describe.configure({ retries: 0 });

test("V3 Search is one global canonical installed-app surface", async ({ page, context }, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "One canonical installed-iOS viewport is sufficient for this bounded Search cutover regression.",
  );

  const url = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_ORGANIZER_B_EMAIL;
  const password = process.env.E2E_ORGANIZER_B_PASSWORD;
  const missingConfig = !url || !publishableKey || !email || !password;

  if (missingConfig && process.env.CI) {
    throw new Error(
      "Browser Audit must seed local Organizer B credentials for the V3 Search proof.",
    );
  }
  test.skip(missingConfig, "Local Organizer B or Supabase browser config is unavailable");

  expect(url).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/);
  await enableInstalledAppMode(context);
  const session = await addSession(context, url!, publishableKey!, email!, password!);

  try {
    await setFeature(url!, publishableKey!, session, "solaris_app_v3", true);
    await setFeature(url!, publishableKey!, session, "solaris_app_v3_explore", true);
    await setFeature(url!, publishableKey!, session, "solaris_app_v3_search", true);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).toBeVisible();
    await expect(page.locator('[data-v3-search-owner="canonical"]')).toHaveCount(1);

    await page
      .locator('[data-v3-search-entry=""]')
      .getByRole("button", { name: "Search Solaris Studio", exact: true })
      .click();

    const search = page.getByRole("searchbox", { name: "Search Solaris Studio", exact: true });
    await expect(search).toBeVisible();
    await search.fill("Browserland");

    const browserland = page.locator("[cmdk-item]").filter({ hasText: "Browserland" }).first();
    await expect(browserland).toBeVisible();
    await browserland.click();
    await expect(page).toHaveURL(/\/countries\/BRW(?:$|[?#])/i);

    await setFeature(url!, publishableKey!, session, "solaris_app_v3_search", false);
    await page.goto("/explore", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Discover the contest", exact: true })).toBeVisible();
    await expect(page.locator('[data-v3-search-entry=""]')).toHaveCount(0);
    await expect(page.locator('[data-v3-explore-search-owner="canonical"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Search Solaris Studio", exact: true })).toBeVisible();

    await setFeature(url!, publishableKey!, session, "solaris_app_v3_search", true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-v3-search-owner="canonical"]')).toHaveCount(1);
    await expect(page.locator('[data-v3-explore-search-owner="canonical"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Search Solaris Studio", exact: true })).toBeVisible();
  } finally {
    await setFeature(url!, publishableKey!, session, "solaris_app_v3_search", false);
    await setFeature(url!, publishableKey!, session, "solaris_app_v3_explore", false);
    await setFeature(url!, publishableKey!, session, "solaris_app_v3", false);
  }
});
