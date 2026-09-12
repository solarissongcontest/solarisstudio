import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

function failOnGovernanceConsoleProblems(page: Page) {
  const problems: string[] = [];
  const collect = (message: ConsoleMessage) => {
    const text = message.text();
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

const SEARCH_CASES = [
  { query: "friend voting", link: /^\/rules\// },
  { query: "artist reuse", link: /^\/rules\// },
  { query: "DQ", link: /^\/rules\// },
  { query: "appeal", link: /^\/integrity\/appeals$/ },
  { query: "anonymous", link: /^\/integrity$/ },
] as const;

test.describe("Rules and Integrity governance discovery", () => {
  test("Library exposes context, aliases and only public destinations", async ({ page }) => {
    const problems = failOnGovernanceConsoleProblems(page);
    await page.goto("/library?from=%2Ftelevoting");

    await expect(page.getByRole("heading", { name: "Search Solaris" })).toBeVisible();
    await expect(page.getByText("Relevant here", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Televoting rules" })).toBeVisible();
    await expect(page.locator('a[href="/rules/10.1"]').first()).toBeVisible();
    await expect(page.locator('main a[href^="/admin"]')).toHaveCount(0);

    const search = page.getByRole("textbox", { name: "Search Solaris Library" });
    await search.focus();
    await expect(search).toBeFocused();

    for (const entry of SEARCH_CASES) {
      await search.fill(entry.query);
      const matchingLinks = page.locator('main a').filter({
        has: page.locator("span"),
      });
      await expect(matchingLinks.filter({ hasText: /./ }).first()).toBeVisible();

      const hrefs = await page.locator('main a[href]').evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? ""),
      );
      expect(
        hrefs.some((href) => entry.link.test(href)),
        `Library search for ${entry.query} should expose a canonical public governance destination`,
      ).toBe(true);
    }

    await search.fill("friend voting");
    await page.getByRole("button", { name: "Clear" }).focus();
    await expect(page.getByRole("button", { name: "Clear" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(search).toHaveValue("");
    await page.keyboard.press("Escape");

    await expectNoHorizontalOverflow(page);
    expect(problems, "Governance pages must not suppress hydration or browser errors").toEqual([]);
  });

  test("permanent rule pages work and the retired floating Rules launcher stays gone", async ({ page }) => {
    const problems = failOnGovernanceConsoleProblems(page);
    await page.goto("/rules/11.2");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText(/Rule 11\.2/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/televoting");
    await expect(page.getByRole("button", { name: /rules for this page/i })).toHaveCount(0);
    await expect(page.locator('button.fixed').filter({ hasText: /^Rules$/ })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    expect(problems, "Rules and participant governance surfaces must stay hydration-clean").toEqual([]);
  });
});
