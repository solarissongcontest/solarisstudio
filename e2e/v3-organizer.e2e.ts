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

test.describe.configure({ retries: 0 });

test("V3 Organizer owns canonical operational navigation and fails back independently", async ({
  page,
  context,
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
  const session = await addSession(context, url!, publishableKey!, email!, password!);
  const country = await fetchSession(url!, publishableKey!, countryEmail!, countryPassword!);

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
    const legacyNav = page.getByRole("navigation", { name: "Organizer navigation" });
    await expect(legacyNav.getByText("Home", { exact: true })).toBeVisible();
    await expect(legacyNav.getByText("Edition", { exact: true })).toBeVisible();
    await expect(legacyNav.getByText("Delegations", { exact: true })).toBeVisible();
  } finally {
    await setFeature(url!, publishableKey!, session, "solaris_app_v3_organizer", false, true);
    // Keep the shared root cohort intact for parallel installed-app/NAV proofs.
  }
});
