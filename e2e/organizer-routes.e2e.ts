import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

import { buildAdminNavigation } from "../src/components/admin/admin-navigation";
import { buildAdminDomainNavigation } from "../src/components/admin/admin-domains";
import { auditPage } from "./audit-helpers";

async function addOrganizerSession(context: BrowserContext) {
  const url = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_ORGANIZER_EMAIL;
  const password = process.env.E2E_ORGANIZER_PASSWORD;

  const missingConfig = !url || !publishableKey || !email || !password;
  if (missingConfig && process.env.CI) {
    throw new Error(
      "Browser Audit must seed local Organizer credentials; refusing to skip authenticated Organizer coverage in CI.",
    );
  }
  test.skip(
    missingConfig,
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

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

async function signInLocalAccount(
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
  expect(response.ok, `Local E2E account ${email} must be able to sign in`).toBeTruthy();
  return (await response.json()) as E2ESession;
}

async function localRpc<T>(
  url: string,
  publishableKey: string,
  token: string,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  expect(response.ok, `${name} must succeed in isolated local E2E: ${raw}`).toBeTruthy();
  return (raw ? JSON.parse(raw) : null) as T;
}

async function newLocalOrganizerContext(
  browser: Browser,
  baseURL: string,
  supabaseUrl: string,
  session: E2ESession,
) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${projectRef}-auth-token`, value: session },
  );
  return context;
}

const organizerDestinations = [
  ...new Set([
    ...buildAdminDomainNavigation("ssc22", "SSC22")
      .filter((item) => item.availability === "ready")
      .map((item) => item.to),
    "/admin/menu",
    ...buildAdminNavigation("ssc22")
      .flatMap((group) => group.items)
      .filter((item) => item.availability === "ready")
      .map((item) => item.to)
      .filter(
        (path) =>
          path.startsWith("/admin") ||
          path.startsWith("/confirmations/admin") ||
          path.startsWith("/televoting/admin"),
      ),
  ]),
];

const criticalMobileDestinations = [
  "/admin/operations",
  "/admin/tasks",
  "/admin/inbox",
  "/admin/action-centre",
  "/admin/ssc22",
  "/admin/countries",
  "/confirmations/admin",
  "/confirmations/admin/sync",
  "/admin/entries/ssc22",
  "/admin/shows/ssc22",
  "/admin/voting-system/ssc22",
  "/televoting/admin",
  "/admin/results",
  "/admin/results-reveal",
  "/admin/publication/ssc22",
  "/admin/communications",
  "/admin/integrity-investigations",
  "/admin/incidents",
  "/admin/access-permissions",
  "/admin/sync-health",
  "/admin/system-operations",
  "/admin/system",
  "/admin/design/ssc22",
  "/admin/more",
  "/admin/fantasy",
  "/admin/time-machine",
  "/admin/command-assistant",
] as const;

const focusedOrganizerDestinations = [
  "/admin/operations",
  "/admin/tasks",
  "/admin/action-centre",
  "/admin/countries",
  "/admin/menu",
] as const;

const completionProductDestinations = [
  "/encyclopedia",
  "/voting-dna",
  "/prediction-league",
  "/fantasy",
  "/admin/fantasy",
  "/admin/time-machine",
  "/admin/command-assistant",
] as const;

test.describe("Solaris Organizer route reliability", () => {
  test.beforeEach(async ({ context }) => {
    await addOrganizerSession(context);
  });

  test("core edition work is discoverable without search", async ({ page }, testInfo) => {
    await auditPage(page, "/admin/ssc22", testInfo);

    for (const name of [
      "Delegations & confirmations",
      "Contest",
      "Voting & results",
      "Live operations",
      "Publish & design",
    ]) {
      await expect(page.getByRole("link", { name: new RegExp(name, "i") }).first()).toBeVisible();
    }

    await page
      .getByRole("link", { name: /Delegations & confirmations/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/countries(?:\?|$)/);
    await expect(page.getByRole("link", { name: /Open confirmations/i })).toBeVisible();

    await page.getByRole("link", { name: /Open confirmations/i }).click();
    await expect(page).toHaveURL(/\/confirmations\/admin(?:\/|\?|$)/);
    await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test.describe("focused Organizer lifecycle regressions", () => {
    test.describe.configure({ retries: 0 });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const originalError = console.error.bind(console);
        console.error = (...args: unknown[]) => {
          const message = args.map((value) => String(value)).join(" ");
          if (/component that hasn't mounted yet/i.test(message)) {
            originalError(
              `[organizer-lifecycle-stack]\n${new Error("React pre-mount update").stack ?? "No stack available"}`,
            );
          }
          originalError(...args);
        };
      });
    });

    test("cold Organizer menu keeps edition items stable while edition data is delayed", async ({
      page,
    }) => {
      let releaseEditionRequest = () => undefined;
      const editionGate = new Promise<void>((resolve) => {
        releaseEditionRequest = resolve;
      });
      const lifecycleWarnings: string[] = [];

      page.on("console", (message) => {
        if (
          ["warning", "error"].includes(message.type()) &&
          /duplicate key|state update.*unmounted|cannot update.*component|has(?:n't| not) mounted yet/i.test(
            message.text(),
          )
        ) {
          lifecycleWarnings.push(message.text());
        }
      });
      page.on("pageerror", (error) => lifecycleWarnings.push(error.message));

      await page.route("**/rest/v1/editions**", async (route) => {
        await editionGate;
        await route.continue();
      });

      try {
        await page.goto("/admin/menu", { waitUntil: "domcontentloaded" });
        await expect(page.locator("h1").first()).toBeVisible();

        const contestItem = page.locator('[data-admin-navigation-id="current-edition-contest"]');
        const unavailableContest = page.locator(
          '[data-admin-navigation-id="current-edition-contest"][aria-disabled="true"]',
        );
        await expect(unavailableContest).toHaveCount(1);
        await expect(unavailableContest).toContainText("Select an edition first");
        await expect(
          page.locator('a[data-admin-navigation-id="current-edition-contest"]'),
        ).toHaveCount(0);

        releaseEditionRequest();
        await expect(contestItem).toHaveAttribute("href", /\/admin\/ssc22$/);
        await expect(contestItem).not.toHaveAttribute("aria-disabled", "true");
        expect(lifecycleWarnings).toEqual([]);
      } finally {
        releaseEditionRequest();
      }
    });

    test("focused Organizer routes remain clean across repeated navigation", async ({
      page,
    }, testInfo) => {
      const lifecycleWarnings: string[] = [];
      page.on("console", (message) => {
        if (
          ["warning", "error"].includes(message.type()) &&
          /duplicate key|state update.*unmounted|cannot update.*component|has(?:n't| not) mounted yet/i.test(
            message.text(),
          )
        ) {
          lifecycleWarnings.push(message.text());
        }
      });
      page.on("pageerror", (error) => lifecycleWarnings.push(error.message));

      for (let attempt = 0; attempt < 3; attempt += 1) {
        for (const path of focusedOrganizerDestinations) {
          await test.step(`${path} (pass ${attempt + 1})`, async () => {
            await auditPage(page, path, testInfo);
            await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);
          });
        }
      }

      expect(lifecycleWarnings).toEqual([]);
    });
  });

  test("every registered Organizer destination loads on desktop", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "organizer-admin-desktop",
      "The complete Organizer crawl runs once at the desktop baseline",
    );

    for (const path of organizerDestinations) {
      await test.step(path, async () => {
        await auditPage(page, path, testInfo);
        await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);
        await expect(page.locator("body")).not.toContainText(
          /This page didn't load|Organizer could not open/i,
        );
      });
    }
  });

  test("completion programme surfaces load during Organizer-only rollout", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "organizer-admin-desktop",
      "Completion-product internal rollout runs once at the desktop baseline",
    );

    for (const path of completionProductDestinations) {
      await test.step(path, async () => {
        await auditPage(page, path, testInfo);
        await expect(page.locator("body")).not.toContainText(
          /not enabled yet|Command Assistant is disabled|Time Machine is disabled/i,
        );
      });
    }
  });

  test("R3 permission changes require a second Organizer on mobile", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "organizer-admin-mobile",
      "The two-operator R3 browser protocol is certified once at the phone baseline",
    );

    const url = process.env.E2E_SUPABASE_URL;
    const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
    const organizerEmail = process.env.E2E_ORGANIZER_EMAIL;
    const organizerPassword = process.env.E2E_ORGANIZER_PASSWORD;
    const organizerBEmail = process.env.E2E_ORGANIZER_B_EMAIL;
    const organizerBPassword = process.env.E2E_ORGANIZER_B_PASSWORD;
    const countryEmail = process.env.E2E_COUNTRY_EMAIL;
    const countryPassword = process.env.E2E_COUNTRY_PASSWORD;
    const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

    const missingR3Config =
      !url ||
      !publishableKey ||
      !organizerEmail ||
      !organizerPassword ||
      !organizerBEmail ||
      !organizerBPassword ||
      !countryEmail ||
      !countryPassword;
    if (missingR3Config && process.env.CI) {
      throw new Error(
        "Browser Audit must seed both local Organizers and the local Country account for R3 certification.",
      );
    }
    test.skip(missingR3Config, "Local two-operator Browser Audit credentials are not configured");

    expect(url).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/);

    const [organizerA, organizerB, country] = await Promise.all([
      signInLocalAccount(url!, publishableKey!, organizerEmail!, organizerPassword!),
      signInLocalAccount(url!, publishableKey!, organizerBEmail!, organizerBPassword!),
      signInLocalAccount(url!, publishableKey!, countryEmail!, countryPassword!),
    ]);

    const preview = await localRpc<{ expectedVersion: number; alreadyApplied: boolean }>(
      url!,
      publishableKey!,
      organizerA.access_token,
      "studio2_permission_change_preview",
      {
        p_user_id: country.user.id,
        p_change_kind: "grant_capability",
        p_key: "broadcast.control",
        p_edition_id: null,
        p_expires_at: null,
      },
    );
    expect(preview.alreadyApplied).toBe(false);

    const operationId = crypto.randomUUID();
    const idempotencyKey = `browser-r3-${operationId}`;

    const approval = await localRpc<{ id: string; canApply: boolean; canApprove: boolean }>(
      url!,
      publishableKey!,
      organizerA.access_token,
      "studio2_request_permission_change_approval",
      {
        p_user_id: country.user.id,
        p_change_kind: "grant_capability",
        p_key: "broadcast.control",
        p_edition_id: null,
        p_expires_at: null,
        p_operation_id: operationId,
        p_idempotency_key: idempotencyKey,
        p_expected_version: preview.expectedVersion,
      },
    );
    expect(approval.id).toBeTruthy();
    expect(approval.canApply).toBe(false);
    expect(approval.canApprove).toBe(false);

    const contextB = await newLocalOrganizerContext(browser, baseURL, url!, organizerB);
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(`${baseURL}/admin/access-permissions`, { waitUntil: "domcontentloaded" });
      await expect(pageB).not.toHaveURL(/\/auth(?:\?|$)/);
      await expect(pageB.getByText("Needs your approval", { exact: true })).toBeVisible();

      await pageB.getByRole("button", { name: "Approve as second operator" }).first().click();
      await expect(pageB.getByText("Fresh authentication required", { exact: true })).toBeVisible();
      const passwordB = pageB.locator('input[type="password"]');
      const identityB = pageB.locator('input[autocomplete="off"]');
      await expect(passwordB).toBeVisible();
      await expect(identityB).toBeVisible();
      await passwordB.fill(organizerBPassword!);
      await identityB.fill("Browser HOD");
      await pageB.getByRole("button", { name: "Approve as second operator" }).last().click();
      await expect(pageB.getByText(/R3 permission change approved/i)).toBeVisible();
    } finally {
      await contextB.close();
    }

    const contextA = await newLocalOrganizerContext(browser, baseURL, url!, organizerA);
    try {
      const pageA = await contextA.newPage();
      await pageA.goto(`${baseURL}/admin/access-permissions`, { waitUntil: "domcontentloaded" });
      await expect(pageA.getByText("Approved for you", { exact: true })).toBeVisible();

      await pageA.getByRole("button", { name: "Apply approved change" }).first().click();
      const passwordA = pageA.locator('input[type="password"]');
      const identityA = pageA.locator('input[autocomplete="off"]');
      await expect(passwordA).toBeVisible();
      await expect(identityA).toBeVisible();
      await passwordA.fill(organizerPassword!);
      await identityA.fill("Browser HOD");
      await pageA.getByRole("button", { name: "Apply approved change" }).last().click();
      await expect(
        pageA.getByText(/Access change applied with fresh authentication/i),
      ).toBeVisible();
      await expect(pageA.getByText("Approved for you", { exact: true })).toHaveCount(0);
    } finally {
      await contextA.close();
    }

    const accessSimulation = await localRpc<{
      userId: string;
      capabilities: string[];
    }>(url!, publishableKey!, organizerA.access_token, "studio2_view_access_as", {
      p_user_id: country.user.id,
      p_edition_id: null,
    });
    expect(accessSimulation.userId).toBe(country.user.id);
    expect(accessSimulation.capabilities).toContain("broadcast.control");

    const remaining = await localRpc<Array<{ id: string }>>(
      url!,
      publishableKey!,
      organizerA.access_token,
      "studio2_list_permission_change_approvals",
      {},
    );
    expect(remaining.some((item) => item.id === approval.id)).toBe(false);
  });

  test("critical Organizer work remains usable on mobile", async ({ page }, testInfo) => {
    test.skip(
      !["organizer-admin-mobile", "organizer-admin-landscape"].includes(testInfo.project.name),
      "Critical mobile Organizer surfaces run at the portrait and landscape phone baselines",
    );

    for (const path of criticalMobileDestinations) {
      await test.step(path, async () => {
        await auditPage(page, path, testInfo);
        await expect(page.locator("body")).not.toContainText(
          /This page didn't load|Organizer could not open/i,
        );
      });
    }
  });
});
