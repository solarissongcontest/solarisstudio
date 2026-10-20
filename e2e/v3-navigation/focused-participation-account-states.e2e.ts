import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

function requiredLocalConfig() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const countryEmail = process.env.E2E_COUNTRY_EMAIL;
  const countryPassword = process.env.E2E_COUNTRY_PASSWORD;
  const organizerEmail = process.env.E2E_ORGANIZER_EMAIL;
  const organizerPassword = process.env.E2E_ORGANIZER_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

  const missing =
    !supabaseUrl ||
    !publishableKey ||
    !countryEmail ||
    !countryPassword ||
    !organizerEmail ||
    !organizerPassword;
  if (missing && process.env.CI) {
    throw new Error(
      "Browser Audit must seed local country + Organizer credentials for focused participation chrome coverage.",
    );
  }
  test.skip(missing, "Local country/Organizer browser credentials are unavailable");

  const url = new URL(supabaseUrl!);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Refusing focused participation E2E against non-local Supabase: ${url.origin}`);
  }

  return {
    supabaseUrl: supabaseUrl!,
    publishableKey: publishableKey!,
    countryEmail: countryEmail!,
    countryPassword: countryPassword!,
    organizerEmail: organizerEmail!,
    organizerPassword: organizerPassword!,
    baseURL,
  };
}

async function fetchSession(
  supabaseUrl: string,
  publishableKey: string,
  email: string,
  password: string,
) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  expect(response.ok, `The isolated local account ${email} must sign in`).toBeTruthy();
  return (await response.json()) as E2ESession;
}

async function installCountrySession(context: BrowserContext) {
  const {
    supabaseUrl,
    publishableKey,
    countryEmail,
    countryPassword,
    baseURL,
  } = requiredLocalConfig();
  const session = await fetchSession(
    supabaseUrl,
    publishableKey,
    countryEmail,
    countryPassword,
  );
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

  await context.addCookies([
    {
      name: "solaris_e2e_maintenance_bypass",
      value: "1",
      url: baseURL,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem("solaris:app-first-run-complete:v1", "1");
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
    },
    { key: `sb-${projectRef}-auth-token`, value: session },
  );

  return session;
}

async function setFeatureForCountry(
  organizer: E2ESession,
  key: "solaris_app_v3_confirmation" | "solaris_app_v3_jury",
  enabled: boolean,
  countryUserId: string,
) {
  const { supabaseUrl, publishableKey } = requiredLocalConfig();
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/studio2_set_feature_flag`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${organizer.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_key: key,
        p_enabled: enabled,
        p_admins_only: false,
        p_user_ids: enabled ? [countryUserId] : [],
        p_edition_ids: [],
      }),
    },
  );
  const body = await response.text();
  expect(response.ok, `Local ${key} rollout mutation must succeed: ${body}`).toBeTruthy();
}

async function expectFocusedParticipationChrome(
  page: Page,
  pathname: "/confirmations" | "/jury-voting" | "/televoting" | "/next-in-line",
  title: "Confirmations" | "Jury voting" | "Televoting" | "Next in Line",
) {
  await page.goto(pathname, { waitUntil: "domcontentloaded" });

  const shell = page.locator('[data-v3-focused-task-shell="participation.task"]');
  await expect(shell).toBeVisible();
  await expect(shell.getByText(title, { exact: true }).first()).toBeVisible();
  await expect(shell.getByRole("link", { name: "Back to Participate", exact: true })).toBeVisible();
  await expect(page.locator(".solaris-app-toolbar")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary app navigation" })).toHaveCount(0);
  await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);
}

test.describe.configure({ retries: 0 });

test("critical participation tasks own focused chrome while non-critical siblings keep normal app chrome", async ({
  page,
  context,
}) => {
  const config = requiredLocalConfig();
  const country = await installCountrySession(context);
  const organizer = await fetchSession(
    config.supabaseUrl,
    config.publishableKey,
    config.organizerEmail,
    config.organizerPassword,
  );

  // Browser Audit owns the shared root V3 cohort through its local seed. This
  // proof mutates only the two independently reversible feature rows it needs,
  // so parallel navigation workers cannot lose their root prerequisite.
  await setFeatureForCountry(organizer, "solaris_app_v3_confirmation", true, country.user.id);
  await setFeatureForCountry(organizer, "solaris_app_v3_jury", true, country.user.id);

  try {
    await expectFocusedParticipationChrome(page, "/confirmations", "Confirmations");
    await expectFocusedParticipationChrome(page, "/jury-voting", "Jury voting");
    await expectFocusedParticipationChrome(page, "/televoting", "Televoting");
    await expectFocusedParticipationChrome(page, "/next-in-line", "Next in Line");

    await page.goto("/televoting/how-to-vote", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-v3-focused-task-shell="participation.task"]')).toHaveCount(0);
    await expect(page.locator(".solaris-app-toolbar")).toBeVisible();

    // Desktop Chromium can simulate standalone ownership in JavaScript but not
    // force its CSS display-mode media query. Assert compatibility navigation
    // is mounted and semantically enabled; WebKit PWA projects own geometry.
    const compatibilityTabbar = page.locator(".solaris-app-tabbar");
    await expect(compatibilityTabbar).toHaveCount(1);
    await expect(compatibilityTabbar).toHaveAttribute("data-mode", "visible");
    await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);
  } finally {
    await setFeatureForCountry(organizer, "solaris_app_v3_jury", false, country.user.id);
    await setFeatureForCountry(organizer, "solaris_app_v3_confirmation", false, country.user.id);
  }
});
