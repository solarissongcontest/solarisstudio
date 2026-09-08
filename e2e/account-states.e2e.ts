import { expect, test, type BrowserContext } from "@playwright/test";

type AccountState = "COUNTRY" | "ORGANIZER" | "SUSPENDED";

async function addSession(
  context: BrowserContext,
  url: string,
  publishableKey: string,
  email: string,
  password: string,
) {
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.ok, "The configured E2E account must be able to sign in").toBeTruthy();
  const session = await response.json();
  const projectRef = new URL(url).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
}

for (const state of ["COUNTRY", "ORGANIZER", "SUSPENDED"] as const satisfies readonly AccountState[]) {
  test(`${state.toLowerCase()} account keeps the correct access scope`, async ({ page, context }) => {
    const url = process.env.E2E_SUPABASE_URL;
    const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
    const email = process.env[`E2E_${state}_EMAIL`];
    const password = process.env[`E2E_${state}_PASSWORD`];
    test.skip(
      !url || !publishableKey || !email || !password,
      `${state} browser credentials or E2E Supabase public config are not configured`,
    );

    await addSession(context, url!, publishableKey!, email!, password!);
    await page.goto("/me", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/missing supabase|database access is unavailable/i);

    if (state === "SUSPENDED") {
      await expect(page.locator("main")).toContainText(/suspend|contact|unavailable/i);
    } else {
      await expect(page.locator("main")).not.toContainText(/signed in as another country/i);
    }

    if (state === "ORGANIZER") {
      await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/operations/);
      await expect(page.getByText("Solaris Organizer", { exact: true })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("This page didn't load");
      await expect(page.locator("body")).not.toContainText("Organizer could not open");
    }
  });
}
