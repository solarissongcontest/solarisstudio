import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const supabaseUrl = process.env.E2E_SUPABASE_URL ?? "";
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "";
const organizerEmail = process.env.S14_ORGANIZER_EMAIL ?? "";
const organizerPassword = process.env.S14_ORGANIZER_PASSWORD ?? "";
const editionId = process.env.S14_EDITION_ID ?? "";
const roundIds = (process.env.S14_TELEVOTE_ROUND_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

async function seedOrganizerBrowserSession(context: BrowserContext) {
  if (!supabaseUrl || !publishableKey || !organizerEmail || !organizerPassword || !editionId) {
    throw new Error("S14 results browser environment is incomplete");
  }
  if (roundIds.length !== 2) throw new Error("S14 results browser requires exactly two bound Televote round ids");

  const response = await context.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    data: { email: organizerEmail, password: organizerPassword },
  });
  expect(response.ok(), `Organizer sign-in failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  const token = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    token_type?: string;
    user?: Record<string, unknown>;
  };
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0] || "local";
  const storageKey = `sb-${projectRef}-auth-token`;
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_in: token.expires_in ?? 3600,
    expires_at: now + (token.expires_in ?? 3600),
    token_type: token.token_type ?? "bearer",
    user: token.user ?? null,
  };

  await context.addInitScript(
    ({ key, value, selectedEdition }) => {
      localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem("solaris:admin:edition-id", selectedEdition);
    },
    { key: storageKey, value: session, selectedEdition: editionId },
  );
}

async function publishRound(page: Page, roundId: string) {
  const selector = page.locator("#result-round");
  await expect(selector).toBeVisible();
  await selector.selectOption(roundId);

  const calculate = page.getByRole("button", { name: /Calculate official result|Recalculate official result/ });
  await expect(calculate).toBeVisible();
  await calculate.click();
  await expect(page.getByRole("button", { name: "Lock official result" })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Lock official result" }).click();
  await expect(page.getByRole("button", { name: "Check & publish" })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Check & publish" }).click();
  await expect(page.getByText("Publish televote result?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish result" }).click();
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
}

test("publishes both S14 semifinal Televote calculations through the real app boundary", async ({ context, page }) => {
  test.skip(!supabaseUrl || !publishableKey, "S14 local Supabase environment is required");
  await seedOrganizerBrowserSession(context);

  await page.goto("/televoting/admin/results", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Televote result" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#result-round")).toBeVisible({ timeout: 60_000 });

  for (const roundId of roundIds) {
    await publishRound(page, roundId);
  }
});
