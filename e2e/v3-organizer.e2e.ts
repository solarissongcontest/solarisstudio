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
  expect(response.ok, "The local Organizer audit account must be able to sign in").toBeTruthy();
  const session = (await response.json()) as E2ESession;
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
      p_user_ids: enabled ? [session.user.id] : [],
      p_edition_ids: [],
    }),
  });
  const body = await response.text();
  expect(response.ok, `Local ${key} rollout mutation must succeed: ${body}`).toBeTruthy();
}

test.describe.configure({ retries: 0 });

test("V3 Organizer owns canonical operational navigation, remembers deep roots and fails back independently", async ({
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
  const missingConfig = !url || !publishableKey || !email || !password;

  if (missingConfig && process.env.CI) {
    throw new Error(
      "Browser Audit must seed local Organizer B credentials for the V3 Organizer proof.",
    );
  }
  test.skip(missingConfig, "Local Organizer B or Supabase browser config is unavailable");

  expect(url).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/);
  const session = await addSession(context, url!, publishableKey!, email!, password!);

  try {
    await setFeature(url!, publishableKey!, session, "solaris_app_v3", true);
    await setFeature(url!, publishableKey!, session, "solaris_app_v3_organizer", true, true);

    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-organizer-generation="v3"]')).toBeVisible();

    const v3Nav = page.getByRole("navigation", { name: "Primary app navigation" });
    await expect(v3Nav).toBeVisible();
    await expect(page.locator("[data-organizer-v3-liquid-nav]")).toHaveCSS("min-height", "0px");
    await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveCount(1);
    await expect(v3Nav.locator('[aria-current="page"]')).toHaveCount(1);

    for (const label of ["Overview", "Tasks", "Control", "Live", "More"]) {
      await expect(v3Nav.getByRole("link", { name: new RegExp(`^${label}(?:,|$)`) })).toHaveCount(1);
    }

    // Deep-route memory is root-scoped. Visiting Inbox should bind that exact
    // Tasks destination, switching away must not erase it, and tapping Tasks
    // should restore Inbox rather than flattening the operator back to /tasks.
    await page.goto("/admin/inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "What needs attention", exact: true })).toBeVisible();
    await expect(v3Nav.getByRole("link", { name: /^Tasks(?:,|$)/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await v3Nav.getByRole("link", { name: /^Overview(?:,|$)/ }).click();
    await expect(page).toHaveURL(/\/admin\/operations(?:$|[?#])/);
    await expect(v3Nav.getByRole("link", { name: /^Overview(?:,|$)/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await v3Nav.getByRole("link", { name: /^Tasks(?:,|$)/ }).click();
    await expect(page).toHaveURL(/\/admin\/inbox(?:$|[?#])/);
    await expect(page.getByRole("heading", { name: "What needs attention", exact: true })).toBeVisible();
    await expect(v3Nav.getByRole("link", { name: /^Tasks(?:,|$)/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await v3Nav.getByRole("link", { name: /^Control(?:,|$)/ }).click();
    await expect(page).toHaveURL(/\/admin\/control(?:$|[?#])/);
    await expect(page.locator('[data-v3-organizer-control=""]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contest systems", exact: true })).toBeVisible();
    await expect(page.getByText("Current edition", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Participation", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contest", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Voting", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Publication", exact: true })).toBeVisible();
    await expect(page.locator('[data-organizer-v3-tabbar-mode="compact"]')).toBeVisible();
    const compactHeight = await page
      .locator(".v3-liquid-tabbar__material")
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(compactHeight).toBeGreaterThanOrEqual(54);
    expect(compactHeight).toBeLessThanOrEqual(58);

    await setFeature(url!, publishableKey!, session, "solaris_app_v3_organizer", false, true);
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-organizer-generation="legacy"]')).toBeVisible();
    const legacyNav = page.getByRole("navigation", { name: "Organizer navigation" });
    await expect(legacyNav.getByText("Home", { exact: true })).toBeVisible();
    await expect(legacyNav.getByText("Edition", { exact: true })).toBeVisible();
    await expect(legacyNav.getByText("Delegations", { exact: true })).toBeVisible();
  } finally {
    await setFeature(url!, publishableKey!, session, "solaris_app_v3_organizer", false, true);
    await setFeature(url!, publishableKey!, session, "solaris_app_v3", false);
  }
});
