import { expect, test } from "@playwright/test";

const OPEN_ROUTES = [
  "/", "/participate", "/auth", "/rules",
  "/confirmations", "/jury-voting", "/televoting",
] as const;
const HIDDEN_ROUTES = [
  "/explore", "/countries", "/editions", "/shows",
  "/results", "/me", "/my-solaris", "/my-solaris/account",
  "/fantasy", "/prediction-league", "/world",
  "/site-directory", "/guide", "/settings", "/notifications",
  "/confirmations/next-in-line", "/televoting/results",
] as const;

test("only the approved public and participation routes render", async ({ page }) => {
  for (const route of OPEN_ROUTES) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('[data-solaris-maintenance="true"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("This page is not available yet");
  }
});

test("hidden public URLs fail closed at the Worker before app SSR", async ({ request }) => {
  for (const route of HIDDEN_ROUTES) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), route).toBe(404);
    expect(response.headers()["cache-control"], route).toContain("no-store");
    expect(response.headers()["x-robots-tag"], route).toContain("noindex");
    expect(await response.text(), route).toContain("This page is not available yet");
  }
});

test("public home navigation does not advertise unpublished areas", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const nav = page.locator('nav[aria-label="Main navigation"], nav[aria-label="Primary navigation"]');
  const links = await nav.locator("a[href]").evaluateAll((items) =>
    items.map((item) => new URL((item as HTMLAnchorElement).href).pathname),
  );
  expect(links).not.toContain("/explore");
  expect(links).not.toContain("/results");
  expect(links).not.toContain("/my-solaris");
  expect(links).not.toContain("/me");
  // A direct refreshed browser navigation must also respect the server gate.
  const blocked = await page.goto("/results", { waitUntil: "domcontentloaded" });
  expect(blocked?.status()).toBe(404);
});

test("installed app launch never restores a hidden destination", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("limited-ios-"));
  await page.addInitScript(() => {
    try {
      const snapshot = { activeTab: "results" };
      localStorage.setItem("solaris:app-navigation:v1", JSON.stringify(snapshot));
      Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
      const original = window.matchMedia.bind(window);
      window.matchMedia = ((query: string) =>
        query === "(display-mode: standalone)"
          ? { matches: true, media: query, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList
          : original(query)
      ) as typeof window.matchMedia;
    } catch { /* storage unavailable before first document */ }
  });
  await page.goto("/app-launch", { waitUntil: "commit" });
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  // A stale Results tab must also stay on Home after the launch restore
  // coordinator has resolved or timed out its local session (1.5 seconds).
  await page.waitForTimeout(2_000);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("body")).not.toContainText("This page is not available yet");
});
