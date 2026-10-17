import { expect, test, type BrowserContext } from "@playwright/test";

type AccountState = "COUNTRY" | "ORGANIZER" | "SUSPENDED";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

const ARCHIVE_EDITION_ID = "00000000-0000-4000-8000-00000000e219";

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
  expect(response.ok, "The configured E2E account must be able to sign in").toBeTruthy();
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
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
  return session;
}

async function enableInstalledAppMode(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });

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

async function setV3FeatureForLocalUser(
  url: string,
  publishableKey: string,
  session: E2ESession,
  key: string,
  enabled: boolean,
  editionIds: string[] = [],
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
      p_admins_only: false,
      p_user_ids: enabled ? (targetUserIds ?? [session.user.id]) : [],
      p_edition_ids: enabled ? editionIds : [],
    }),
  });
  const body = await response.text();
  expect(response.ok, `Local ${key} rollout mutation must succeed: ${body}`).toBeTruthy();
}

async function setV3ForLocalUser(
  url: string,
  publishableKey: string,
  session: E2ESession,
  enabled: boolean,
) {
  await setV3FeatureForLocalUser(
    url,
    publishableKey,
    session,
    "solaris_app_v3",
    enabled,
  );
}

// Several tests deliberately mutate the same local rollout rows. Serializing this
// one account-state project prevents one valid rollout proof from rewriting the
// authority scope underneath another. This affects only isolated local Supabase.
test.describe.configure({ mode: "serial" });

for (const state of ["COUNTRY", "ORGANIZER", "SUSPENDED"] as const satisfies readonly AccountState[]) {
  test(`${state.toLowerCase()} account keeps the correct access scope`, async ({ page, context }) => {
    const url = process.env.E2E_SUPABASE_URL;
    const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
    const email = process.env[`E2E_${state}_EMAIL`];
    const password = process.env[`E2E_${state}_PASSWORD`];
    const missingConfig = !url || !publishableKey || !email || !password;
    if (missingConfig && process.env.CI) {
      throw new Error(
        `Browser Audit must seed local ${state} credentials; refusing to skip authenticated account-state coverage in CI.`,
      );
    }
    test.skip(
      missingConfig,
      `${state} browser credentials or E2E Supabase public config are not configured`,
    );

    await addSession(context, url!, publishableKey!, email!, password!);
    await page.goto("/me", { waitUntil: "domcontentloaded" });
    const contentMain = page.locator("main:not([aria-busy='true'])").last();
    await expect(contentMain).toBeVisible();
    await expect(contentMain).not.toContainText(/missing supabase|database access is unavailable/i);

    if (state === "SUSPENDED") {
      await expect(contentMain).toContainText(/suspend|contact|unavailable/i);
    } else {
      await expect(contentMain).not.toContainText(/signed in as another country/i);
    }

    if (state === "ORGANIZER") {
      await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/operations/);
      await expect(page.getByRole("heading", { name: "Solaris Organizer", exact: true })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("This page didn't load");
      await expect(page.locator("body")).not.toContainText("Organizer could not open");

      await page.goto("/my-solaris/notices", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/my-solaris\/notices/);
      await expect(page.locator("body")).not.toContainText("This page didn't load");
      await expect(page.locator("body")).toContainText(
        /Public notifications|Official communications|Official notices/i,
      );
    }
  });
}

test("country participant Entry cuts over to V3 without taking Organizer inspection ownership", async ({ page, context }) => {
  const url = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const countryEmail = process.env.E2E_COUNTRY_EMAIL;
  const countryPassword = process.env.E2E_COUNTRY_PASSWORD;
  const organizerEmail = process.env.E2E_ORGANIZER_EMAIL;
  const organizerPassword = process.env.E2E_ORGANIZER_PASSWORD;
  const missingConfig =
    !url || !publishableKey || !countryEmail || !countryPassword || !organizerEmail || !organizerPassword;

  if (missingConfig && process.env.CI) {
    throw new Error("Browser Audit must seed local country + Organizer credentials for V3 Entry proof.");
  }
  test.skip(missingConfig, "Local V3 Entry browser credentials are not configured");
  expect(url).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/);

  await enableInstalledAppMode(context);
  await context.addInitScript(() => {
    localStorage.setItem("solaris:app-first-run-complete:v1", "1");
  });
  const country = await addSession(
    context,
    url!,
    publishableKey!,
    countryEmail!,
    countryPassword!,
  );
  const organizer = await fetchSession(
    url!,
    publishableKey!,
    organizerEmail!,
    organizerPassword!,
  );
  const target = [country.user.id];

  await setV3FeatureForLocalUser(url!, publishableKey!, organizer, "solaris_app_v3", true, [], target);
  await setV3FeatureForLocalUser(url!, publishableKey!, organizer, "hod_workspace_v2", true, [], target);
  await setV3FeatureForLocalUser(
    url!,
    publishableKey!,
    organizer,
    "solaris_app_v3_entry",
    true,
    [],
    target,
  );

  try {
    await page.goto("/my-solaris/entry", { waitUntil: "domcontentloaded" });
    const entryRoot = page.locator("[data-v3-entry-root]");
    await expect(entryRoot).toBeVisible();
    await expect(entryRoot).toHaveAttribute("data-v3-entry-state", "ready");
    await expect(page.getByRole("heading", { name: "Your entry", exact: true })).toBeVisible();
    await expect(page.locator("[data-v3-entry-readiness]")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary app navigation" })
      .getByRole("link", { name: "Participate", exact: true }))
      .toHaveAttribute("aria-current", "page");
    await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);

    // A country selector is an Organizer inspection contract. It must never be
    // silently reinterpreted as the participant V3 Entry workspace.
    await page.goto("/my-solaris/entry?country=BRW", { waitUntil: "domcontentloaded" });
    await expect(entryRoot).toHaveCount(0);
  } finally {
    await setV3FeatureForLocalUser(url!, publishableKey!, organizer, "solaris_app_v3_entry", false);
    await setV3FeatureForLocalUser(url!, publishableKey!, organizer, "hod_workspace_v2", false);
  }
});

test("server-authorized V3 rollout keeps primary, Edition and Delegation content aligned with app navigation", async ({ page, context }) => {
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
      "Browser Audit must seed local Organizer B + country credentials for the V3 positive-path cutover proof.",
    );
  }
  test.skip(
    missingConfig,
    "Organizer B/country browser credentials or E2E Supabase public config are not configured",
  );

  expect(url).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/);
  await enableInstalledAppMode(context);
  // This regression covers returning-user primary navigation. First-run onboarding
  // is a legitimate modal and would otherwise intercept the nav click under test.
  await context.addInitScript(() => {
    localStorage.setItem("solaris:app-first-run-complete:v1", "1");
  });
  const session = await addSession(context, url!, publishableKey!, email!, password!);
  const countrySession = await fetchSession(
    url!,
    publishableKey!,
    countryEmail!,
    countryPassword!,
  );
  // Feature flags are single authoritative rows. Preserve the country cohort
  // seeded for the parallel installed-app NAV project while temporarily adding
  // Organizer B to the same rollout. Otherwise this test can disable V3 under a
  // different Playwright worker and make unrelated geometry tests fail.
  const globalRolloutTargets = [countrySession.user.id, session.user.id];
  await setV3FeatureForLocalUser(
    url!,
    publishableKey!,
    session,
    "solaris_app_v3",
    true,
    [],
    globalRolloutTargets,
  );
  await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_explore", true);
  await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_edition_hub", true);
  await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_delegation", true);
  await setV3FeatureForLocalUser(
    url!, publishableKey!, session, "solaris_app_v3_results", true, [ARCHIVE_EDITION_ID],
  );

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-solaris-runtime", "standalone");
    const primaryNav = page.getByRole("navigation", { name: "Primary app navigation" });
    await expect(primaryNav).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).toBeVisible();
    await expect(page.getByText("Current contest", { exact: true })).toBeVisible();
    await expect(page.getByText("Browser Audit Edition", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);

    await primaryNav.getByRole("link", { name: "Participate", exact: true }).click();
    await expect(page).toHaveURL(/\/participate\/?$/);
    await expect(page.getByRole("heading", { name: "Your participation", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).not.toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Participate", exact: true })).toHaveAttribute(
      "aria-current", "page",
    );
    await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);

    await primaryNav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your participation", exact: true })).not.toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute(
      "aria-current", "page",
    );

    await primaryNav.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/?$/);
    await expect(page.getByRole("heading", { name: "Discover the contest", exact: true })).toBeVisible();
    await expect(page.getByText("Browser Audit Edition", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).not.toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute(
      "aria-current", "page",
    );
    await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);

    await page.getByRole("link", { name: /Open edition/i }).click();
    await expect(page).toHaveURL(/\/editions\/ssc22\/?$/);
    await expect(page.getByRole("heading", { name: "Browser Audit Edition", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "At a glance", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Participants", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Songs & artists", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute(
      "aria-current", "page",
    );
    await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);

    await page.goto("/countries/BRW", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Browserland", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Current entry", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Participation history", exact: true })).toBeVisible();
    await expect(page.locator(".country-profile-v8")).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute(
      "aria-current", "page",
    );

    await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_delegation", false);
    await page.goto("/countries/BRW", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".country-profile-v8")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Browserland", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/results", { waitUntil: "domcontentloaded" });
    const resultRoot = page.locator("[data-v3-results-root]");
    await expect(resultRoot).toBeVisible();
    await expect(resultRoot).toHaveAttribute("data-v3-results-state", "spoiler-protected");
    await expect(resultRoot).not.toContainText("111222");
    await expect(resultRoot).not.toContainText("Private archive artist");
    await expect(resultRoot.getByRole("navigation", { name: "More result analysis" })).toHaveCount(0);
    const reveal = resultRoot.getByRole("button", { name: "Reveal official result" });
    await reveal.focus();
    await page.keyboard.press("Enter");
    await expect(resultRoot.locator("[data-v3-scoreboard]")).toBeVisible();
    await expect(resultRoot).toContainText("111222");
    await expect(resultRoot.getByRole("button", { name: "Jury", exact: true })).toBeVisible();
    await expect(resultRoot.getByRole("button", { name: "Televote", exact: true })).toHaveCount(0);
    await resultRoot.getByRole("button", { name: "Jury", exact: true }).click();
    await expect(resultRoot).toContainText("110222");
    await expect(resultRoot).not.toContainText("Private archive artist");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(resultRoot).toHaveAttribute("data-v3-results-state", "spoiler-protected");
    await expect(resultRoot).not.toContainText("111222");

    await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_results", false);
    await page.goto("/results", { waitUntil: "domcontentloaded" });
    await expect(resultRoot).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });

    await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_me", true);
    await page.goto("/my-solaris", { waitUntil: "domcontentloaded" });
    const meRoot = page.locator("[data-v3-me-root]");
    await expect(meRoot).toBeVisible();
    await expect(meRoot.getByRole("heading", { name: "Identity", exact: true })).toBeVisible();
    await expect(meRoot.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    await expect(meRoot).toContainText("Delegation history is unavailable");
    await expect(meRoot.getByRole("link", { name: /Switch to Organizer/ })).toBeVisible();
    await expect(meRoot).not.toContainText("Private archive artist");
    await page.goto("/my-solaris?tab=account", { waitUntil: "domcontentloaded" });
    await expect(meRoot).toHaveCount(0);
    await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_me", false);
    await page.goto("/my-solaris", { waitUntil: "domcontentloaded" });
    await expect(meRoot).toHaveCount(0);

    await setV3FeatureForLocalUser(
      url!, publishableKey!, session, "solaris_app_v3_edition_hub", true, [ARCHIVE_EDITION_ID],
    );

    await page.goto("/editions/ssc21", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Browser Archive Edition", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Explore Browser Archive Edition" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "At a glance", exact: true })).toBeVisible();
    await expect(page.locator(".edition-public-page")).toHaveCount(0);

    await page.goto("/editions/ssc22", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".edition-public-page")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Explore Browser Audit Edition" })).toHaveCount(0);
  } finally {
    await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_me", false);
    await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_results", false);
    await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_delegation", false);
    await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_edition_hub", false);
    await setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_explore", false);
    // Restore the exact country-only App V3 baseline seeded for the parallel
    // installed-app project instead of globally disabling the one-row flag.
    await setV3FeatureForLocalUser(
      url!,
      publishableKey!,
      session,
      "solaris_app_v3",
      true,
      [],
      [countrySession.user.id],
    );
  }
});
