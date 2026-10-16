import { expect, test, type BrowserContext } from "@playwright/test";

const supabaseUrl = process.env.E2E_SUPABASE_URL ?? "";
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "";
const organizerEmail = process.env.S14_ORGANIZER_EMAIL ?? "";
const organizerPassword = process.env.S14_ORGANIZER_PASSWORD ?? "";
const editionId = process.env.S14_EDITION_ID ?? "";
const editionSlug = process.env.S14_EDITION_SLUG ?? "";
const finalShowId = process.env.S14_FINAL_SHOW_ID ?? "";

async function seedOrganizerBrowserSession(context: BrowserContext) {
  if (
    !supabaseUrl ||
    !publishableKey ||
    !organizerEmail ||
    !organizerPassword ||
    !editionId ||
    !editionSlug ||
    !finalShowId
  ) {
    throw new Error("S14 grand-final browser environment is incomplete");
  }
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/.test(supabaseUrl)) {
    throw new Error("S14 grand-final browser refuses non-local Supabase URL");
  }

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

test("promotes exactly the canonical S14 qualifiers through the real Organizer lineup action", async ({ context, page }) => {
  test.skip(!supabaseUrl || !publishableKey, "S14 local Supabase environment is required");
  await seedOrganizerBrowserSession(context);

  await page.goto(`/admin/entries/${editionSlug}?show=${encodeURIComponent(finalShowId)}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Line-up, allocation & running order" })).toBeVisible({
    timeout: 60_000,
  });

  const showSelector = page.getByLabel("Current show");
  await expect(showSelector).toBeVisible();
  await expect(showSelector).toHaveValue(finalShowId);

  await page.getByRole("button", { name: "More" }).click();
  const promote = page.getByRole("button", { name: "Add semi-final qualifiers" });
  await expect(promote).toBeVisible();
  await expect(promote).toBeEnabled();
  await promote.click();

  await expect(page.getByText("Added 20 qualifiers without creating a running order", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
});
