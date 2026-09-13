import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

function failOnGovernanceConsoleProblems(page: Page) {
  const problems: string[] = [];
  const collect = (message: ConsoleMessage) => {
    const text = message.text();
    const isLocalSandboxTransportFailure =
      !process.env.CI &&
      message.type() === "error" &&
      /net::ERR_(?:EMPTY_RESPONSE|TIMED_OUT)/.test(text);

    if (isLocalSandboxTransportFailure) return;

    if (
      message.type() === "error" ||
      /hydration (?:failed|completed)|hydration mismatch|server rendered html/i.test(text)
    ) {
      problems.push(`${message.type()}: ${text}`);
    }
  };
  page.on("console", collect);
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.document, "document should not overflow horizontally").toBeLessThanOrEqual(1);
  expect(overflow.body, "body should not overflow horizontally").toBeLessThanOrEqual(1);
}

test.describe("Rules and Integrity governance discovery", () => {
  test("one public sidebar exposes every governance destination", async ({ page }) => {
    const problems = failOnGovernanceConsoleProblems(page);

    await page.goto("/televoting");
    const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
    if (!desktop) await page.getByRole("button", { name: "Open navigation" }).click();
    const navigation = desktop
      ? page.getByRole("complementary", { name: "All public pages" })
      : page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("heading", { name: "Rules & help" })).toBeVisible();
    for (const destination of [
      "/rules",
      "/rules/interpretations",
      "/rules/changes",
      "/integrity",
      "/integrity/appeals",
      "/integrity/preclearance",
    ]) {
      await expect(navigation.locator(`a[href="${destination}"]`)).toBeVisible();
    }
    await expect(navigation.locator('a[href^="/admin"]')).toHaveCount(0);

    if (desktop) {
      const search = navigation.getByRole("searchbox", { name: "Find a public page" });
      await search.focus();
      await expect(search).toBeFocused();
      await search.fill("appeal");
      await expect(navigation.locator('a[href="/integrity/appeals"]')).toBeVisible();
      await expect(navigation.locator('a[href="/editions"]')).toHaveCount(0);
    }

    await page.goto("/library");
    await expect(page).toHaveURL(/\/rules\/?$/);
    await expect(page.locator("h1")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expect(problems, "Governance pages must not suppress hydration or browser errors").toEqual([]);
  });

  test("permanent rule pages work and the retired floating Rules launcher stays gone", async ({
    page,
  }) => {
    const problems = failOnGovernanceConsoleProblems(page);
    await page.goto("/rules/11.2");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText(/Rule 11\.2/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/televoting");
    await expect(page.getByRole("button", { name: /rules for this page/i })).toHaveCount(0);
    await expect(page.locator("button.fixed").filter({ hasText: /^Rules$/ })).toHaveCount(0);
    if ((page.viewportSize()?.width ?? 0) < 1024) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }).locator('a[href="/rules"]'),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("complementary", { name: "All public pages" }).locator('a[href="/rules"]'),
      ).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    expect(problems, "Rules and participant governance surfaces must stay hydration-clean").toEqual(
      [],
    );
  });
});
