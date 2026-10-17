import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

function requiredLocalConfig() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_COUNTRY_EMAIL;
  const password = process.env.E2E_COUNTRY_PASSWORD;

  const missing = !supabaseUrl || !publishableKey || !email || !password;
  if (missing && process.env.CI) {
    throw new Error(
      "Browser Audit must seed local country credentials for focused participation chrome coverage.",
    );
  }
  test.skip(missing, "Local country browser credentials are unavailable");

  const url = new URL(supabaseUrl!);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Refusing focused participation E2E against non-local Supabase: ${url.origin}`);
  }

  return {
    supabaseUrl: supabaseUrl!,
    publishableKey: publishableKey!,
    email: email!,
    password: password!,
  };
}

async function installCountrySession(context: BrowserContext) {
  const { supabaseUrl, publishableKey, email, password } = requiredLocalConfig();
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  expect(response.ok, "The isolated local country account must sign in").toBeTruthy();
  const session = (await response.json()) as E2ESession;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

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
}

async function expectFocusedParticipationChrome(
  page: Page,
  pathname: "/televoting" | "/next-in-line",
  title: "Televoting" | "Next in Line",
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

test("global V3 participation tasks own focused chrome while non-critical siblings keep normal app chrome", async ({
  page,
  context,
}) => {
  requiredLocalConfig();
  await installCountrySession(context);

  // Browser Audit seeds the country account into the global V3 cohort. This
  // proof is intentionally read-only: it must not mutate the shared one-row
  // rollout flags and race the serialized account-state suite.
  await expectFocusedParticipationChrome(page, "/televoting", "Televoting");
  await expectFocusedParticipationChrome(page, "/next-in-line", "Next in Line");

  await page.goto("/televoting/how-to-vote", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-v3-focused-task-shell="participation.task"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "How the televote works", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);
});
