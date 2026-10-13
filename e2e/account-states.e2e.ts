import { expect, test, type BrowserContext } from "@playwright/test";

type AccountState = "COUNTRY" | "ORGANIZER" | "SUSPENDED";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
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
  expect(response.ok, "The configured E2E account must be able to sign in").toBeTruthy();
  const session = (await response.json()) as E2ESession;
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

test("server-authorized V3 rollout keeps primary content aligned with app navigation", async ({ page, context }) => {
  const url = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_ORGANIZER_B_EMAIL;
  const password = process.env.E2E_ORGANIZER_B_PASSWORD;
  const missingConfig = !url || !publishableKey || !email || !password;

  if (missingConfig && process.env.CI) {
    throw new Error(
      "Browser Audit must seed local Organizer B credentials for the V3 positive-path cutover proof.",
    );
  }
  test.skip(
    missingConfig,
    "Organizer B browser credentials or E2E Supabase public config are not configured",
  );

  expect(url).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/);
  await enableInstalledAppMode(context);
  // This regression covers returning-user primary navigation. First-run onboarding
  // is a legitimate modal and would otherwise intercept the nav click under test.
  await context.addInitScript(() => {
    localStorage.setItem("solaris:app-first-run-complete:v1", "1");
  });
  const session = await addSession(context, url!, publishableKey!, email!, password!);
  await setV3ForLocalUser(url!, publishableKey!, session, true);
  await setV3FeatureForLocalUser(
    url!,
    publishableKey!,
    session,
    "solaris_app_v3_explore",
    true,
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

    // Use the real client-side app navigation. A fresh page.goto() cannot catch
    // retained-route mismatches where the URL/nav advances before old content.
    await primaryNav.getByRole("link", { name: "Participate", exact: true }).click();
    await expect(page).toHaveURL(/\/participate\/?$/);
    await expect(page.getByRole("heading", { name: "Your participation", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).not.toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Participate", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);

    await primaryNav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your participation", exact: true })).not.toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await primaryNav.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/?$/);
    await expect(page.getByRole("heading", { name: "Discover the contest", exact: true })).toBeVisible();
    await expect(page.getByText("Browser Audit Edition", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).not.toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);
  } finally {
    await setV3FeatureForLocalUser(
      url!,
      publishableKey!,
      session,
      "solaris_app_v3_explore",
      false,
    );
    await setV3ForLocalUser(url!, publishableKey!, session, false);
  }
});
