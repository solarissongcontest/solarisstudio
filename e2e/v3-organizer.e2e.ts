import { expect, test, type BrowserContext } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
};

async function fetchSession(
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
  expect(response.ok, "The local Organizer audit account must be able to sign in").toBeTruthy();
  return (await response.json()) as E2ESession;
}

async function addSession(
  context: BrowserContext,
  url: string,
  publishableKey: string,
  email: string,
  password: string,
): Promise<E2ESession> {
  const session = await fetchSession(url, publishableKey, email, password);
  const projectRef = new URL(url).hostname.split(".")[0];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${projectRef}-auth-token`, value: session },
  );
  return session;
}

async function setFeature(
  url: string,
  publishableKey: string,
  session: E2ESession,
  key: string,
  enabled: boolean,
  adminsOnly = false,
  targetUserIds?: string[],
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
      p_admins_only: adminsOnly,
      p_user_ids: enabled ? (targetUserIds ?? [session.user.id]) : [],
      p_edition_ids: [],
    }),
  });
  const body = await response.text();
  expect(response.ok, `Local ${key} rollout mutation must succeed: ${body}`).toBeTruthy();
}

/** The Organizer PWA lane must use standalone runtime, not iPhone viewport alone. */
async function enableInstalledAppMode(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    const previousMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query !== "(display-mode: standalone)") return previousMatchMedia(query);
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
    }) as typeof window.matchMedia;
  });
}

test.describe.configure({ retries: 0 });

test("V3 Organizer owns canonical operational navigation and fails back independently", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "One installed-iOS viewport is sufficient for the bounded Organizer navigation cutover proof.",
  );

  const url = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_ORGANIZER_B_EMAIL;
  const password = process.env.E2E_ORGANIZER_B_PASSWORD;
  const countryEmail = process.env.E2E_COUNTRY_EMAIL;
  const countryPassword = process.env.E2E_COUNTRY_PASSWORD;
  const missingConfig =
    !url || !publishableKey || !email || !password || !countryEmail || !countryPassword;

  if (missingConfig && process.env.CI) {
    throw new Error(
      "Browser Audit must seed local Organizer B + country credentials for the V3 Organizer proof.",
    );
  }
  test.skip(missingConfig, "Local Organizer B, country or Supabase browser config is unavailable");

  expect(url).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/);
  await enableInstalledAppMode(context);
  const session = await addSession(context, url!, publishableKey!, email!, password!);
  const country = await fetchSession(url!, publishableKey!, countryEmail!, countryPassword!);
  let webContext: BrowserContext | null = null;

  try {
    await setFeature(
      url!,
      publishableKey!,
      session,
      "solaris_app_v3",
      true,
      false,
      [session.user.id, country.user.id],
    );
    await setFeature(url!, publishableKey!, session, "solaris_app_v3_organizer", true, true);

    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-organizer-generation="v3"]')).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Organizer navigation" })).toBeVisible();

    for (const label of ["Overview", "Tasks", "Control", "Live", "More"]) {
      await expect(
        page.getByRole("navigation", { name: "Organizer navigation" }).getByText(label, { exact: true }),
      ).toBeVisible();
    }

    // V3 installed 720-899px: the Liquid dock, not the desktop sidebar, owns
    // the primary navigation. One representative landscape-tablet size is
    // sufficient here; broad geometry belongs to the manual N14 audit.
    await page.setViewportSize({ width: 820, height: 1024 });
    await expect(page.locator('[data-organizer-runtime="app"]')).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Organizer navigation" })).toBeVisible();
    await expect(page.locator(".admin-sidebar")).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });

    // Use a separate, non-standalone context for the SAME local Organizer B.
    // No rollout mutation occurs while these browser assertions run.
    webContext = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173",
      // Inherit the isolated maintenance-bypass cookie, not standalone mode.
      storageState: await context.storageState(),
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await addSession(webContext, url!, publishableKey!, email!, password!);
    const webPage = await webContext.newPage();
    await webPage.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(
      webPage.locator('[data-organizer-generation="v3"][data-organizer-runtime="web"]'),
    ).toBeVisible();
    const websiteNav = webPage.getByRole("navigation", { name: "Organizer website sections" });
    await expect(websiteNav).toBeVisible();
    for (const label of ["Overview", "Tasks", "Control", "Live", "More"]) {
      await expect(websiteNav.getByRole("link", { name: label, exact: true })).toHaveCount(1);
    }
    await expect(webPage.locator('[data-organizer-v3-liquid-nav]')).toHaveCount(0);
    const taskTargetHeight = await websiteNav.getByRole("link", { name: "Tasks" })
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(taskTargetHeight).toBeGreaterThanOrEqual(44);

    await websiteNav.getByRole("link", { name: "Tasks" }).click();
    await expect(webPage).toHaveURL(/\/admin\/tasks(?:$|[?#])/);
    await webPage.goBack({ waitUntil: "domcontentloaded" });
    await expect(webPage).toHaveURL(/\/admin\/operations(?:$|[?#])/);

    // The 720px desktop/sidebar cutover belongs to the website, not the PWA.
    await webPage.setViewportSize({ width: 820, height: 1024 });
    await expect(websiteNav).toBeHidden();
    await expect(webPage.locator(".admin-sidebar")).toBeVisible();
    await webPage.setViewportSize({ width: 390, height: 844 });

    await page.getByRole("navigation", { name: "Organizer navigation" }).getByText("Control", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/control(?:$|[?#])/);
    await expect(page.locator('[data-v3-organizer-control=""]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contest systems", exact: true })).toBeVisible();
    await expect(page.getByText("Current edition", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Participation", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contest", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Voting", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Publication", exact: true })).toBeVisible();

    await setFeature(url!, publishableKey!, session, "solaris_app_v3_organizer", false, true);
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-organizer-generation="legacy"]')).toBeVisible();

    // The same phone browser must now use the pre-V3 website family, not the
    // legacy installed dock. Reload resolves the server-owned feature flag.
    if (!webContext) throw new Error("Organizer website context was not created");
    const legacyWebPage = webContext.pages()[0];
    await legacyWebPage.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(
      legacyWebPage.locator('[data-organizer-generation="legacy"][data-organizer-runtime="web"]'),
    ).toBeVisible();
    const legacyWebsiteNav = legacyWebPage.getByRole("navigation", { name: "Organizer website sections" });
    await expect(legacyWebsiteNav).toBeVisible();
    for (const label of ["Home", "Edition", "Tasks", "Delegations", "More"]) {
      await expect(legacyWebsiteNav.getByText(label, { exact: true })).toHaveCount(1);
    }
    await expect(legacyWebPage.locator('.admin-mobile-nav[data-v6-organizer-tabbar]')).toHaveCount(0);
    const legacyNav = page.getByRole("navigation", { name: "Organizer navigation" });
    await expect(legacyNav.getByText("Home", { exact: true })).toBeVisible();
    await expect(legacyNav.getByText("Edition", { exact: true })).toBeVisible();
    await expect(legacyNav.getByText("Delegations", { exact: true })).toBeVisible();
  } finally {
    await webContext?.close();
    await setFeature(url!, publishableKey!, session, "solaris_app_v3_organizer", false, true);
    // Keep the shared root cohort intact for parallel installed-app/NAV proofs.
  }
});
