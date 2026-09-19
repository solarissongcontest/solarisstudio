import { expect, test, type BrowserContext } from "@playwright/test";

import { buildAdminNavigation } from "../src/components/admin/admin-navigation";
import { auditPage } from "./audit-helpers";

async function addOrganizerSession(context: BrowserContext) {
  const url = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_ORGANIZER_EMAIL;
  const password = process.env.E2E_ORGANIZER_PASSWORD;

  test.skip(
    !url || !publishableKey || !email || !password,
    "Organizer browser credentials or E2E Supabase public config are not configured",
  );

  const response = await fetch(`${url!.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.ok, "The configured Organizer E2E account must be able to sign in").toBeTruthy();

  const session = await response.json();
  const projectRef = new URL(url!).hostname.split(".")[0];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${projectRef}-auth-token`, value: session },
  );
}

const organizerDestinations = [
  ...new Set(
    buildAdminNavigation("ssc22")
      .flatMap((group) => group.items)
      .map((item) => item.to)
      .filter(
        (path) =>
          path.startsWith("/admin") ||
          path.startsWith("/confirmations/admin") ||
          path.startsWith("/televoting/admin"),
      ),
  ),
];

const criticalMobileDestinations = [
  "/admin/operations",
  "/admin/inbox",
  "/admin/ssc22",
  "/admin/integrity-investigations",
  "/admin/more",
  "/admin/entries/ssc22",
  "/admin/shows/ssc22",
  "/admin/design/ssc22",
  "/televoting/admin",
] as const;

test.describe("Solaris Organizer route reliability", () => {
  test.beforeEach(async ({ context }) => {
    await addOrganizerSession(context);
  });

  test("every registered Organizer destination loads on desktop", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "organizer-admin-desktop",
      "The complete Organizer crawl runs once at the desktop baseline",
    );

    for (const path of organizerDestinations) {
      await test.step(path, async () => {
        await auditPage(page, path, testInfo);
        await expect(page.locator("body")).not.toContainText(/This page didn't load|Organizer could not open/i);
      });
    }
  });

  test("critical Organizer work remains usable on mobile", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "organizer-admin-mobile",
      "Critical mobile Organizer surfaces run at the phone baseline",
    );

    for (const path of criticalMobileDestinations) {
      await test.step(path, async () => {
        await auditPage(page, path, testInfo);
        await expect(page.locator("body")).not.toContainText(/This page didn't load|Organizer could not open/i);
      });
    }
  });
});
