import { expect, test, type BrowserContext } from "@playwright/test";

const SUPABASE_URL = "https://oxtbskojiexkaspputvo.supabase.co";
const SUPABASE_KEY = "sb_publishable_HlFRpOFUHzotkO609JPXgQ_ZWi8DSCj";
const STORAGE_KEY = "sb-oxtbskojiexkaspputvo-auth-token";

type AccountState = "COUNTRY" | "ORGANIZER" | "SUSPENDED";

async function addSession(context: BrowserContext, email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.ok, "The configured E2E account must be able to sign in").toBeTruthy();
  const session = await response.json();
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: session },
  );
}

for (const state of [
  "COUNTRY",
  "ORGANIZER",
  "SUSPENDED",
] as const satisfies readonly AccountState[]) {
  test(`${state.toLowerCase()} account keeps the correct access scope`, async ({
    page,
    context,
  }) => {
    const email = process.env[`E2E_${state}_EMAIL`];
    const password = process.env[`E2E_${state}_PASSWORD`];
    test.skip(!email || !password, `${state} E2E credentials are not configured`);

    await addSession(context, email!, password!);
    await page.goto("/me", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /missing supabase|database access is unavailable/i,
    );

    if (state === "SUSPENDED") {
      await expect(page.locator("main")).toContainText(/suspend|contact|unavailable/i);
    } else {
      await expect(page.locator("main")).not.toContainText(/signed in as another country/i);
    }
  });
}
