import { expect, type Page, type TestInfo } from "@playwright/test";

export const STATIC_PUBLIC_ROUTES = [
  "/",
  "/analysis",
  "/archive-games",
  "/auth",
  "/beta-test",
  "/broadcast-intelligence",
  "/compare",
  "/confirmations",
  "/countries",
  "/editions",
  "/guide",
  "/jury-voting",
  "/next-in-line",
  "/participate",
  "/predictions",
  "/pulse",
  "/records",
  "/relationships",
  "/result-lab",
  "/results",
  "/scorecharts",
  "/shows",
  "/taste-dna",
  "/televoting",
  "/tools",
  "/wiki",
] as const;

const ignorableRequest = (url: string) =>
  /favicon|google-analytics|googletagmanager|browser-extension|chrome-extension/i.test(url);

export async function sitemapRoutes(baseURL: string) {
  const response = await fetch(new URL("/sitemap.xml", baseURL));
  if (!response.ok) return [];
  const xml = await response.text();
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((match) => {
      try {
        return new URL(match[1]).pathname;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

export async function auditPage(page: Page, path: string, testInfo: TestInfo) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  const onConsole = (message: { type(): string; text(): string }) => {
    if (
      message.type() === "error" &&
      !/favicon|hydration completed but contains/i.test(message.text())
    ) {
      consoleErrors.push(message.text());
    }
  };
  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onRequestFailed = (request: { url(): string; failure(): { errorText: string } | null }) => {
    if (!ignorableRequest(request.url())) {
      failedRequests.push(`${request.url()} — ${request.failure()?.errorText ?? "failed"}`);
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);

  try {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${path} should return a successful document`).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(350);

    const result = await page.evaluate(() => {
      const duplicateIds = [...document.querySelectorAll<HTMLElement>("[id]")]
        .map((node) => node.id)
        .filter((id, index, ids) => id && ids.indexOf(id) !== index);
      const brokenImages = [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src);
      const unnamedControls = [
        ...document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea"),
      ]
        .filter((node) => {
          if (node.closest("[inert], [aria-hidden='true']")) return false;
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") return false;
          return !(
            node.getAttribute("aria-label") ||
            node.getAttribute("aria-labelledby") ||
            node.textContent?.trim() ||
            (node as HTMLInputElement).title
          );
        })
        .map((node) => node.outerHTML.slice(0, 180));
      return {
        overflow:
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
          window.innerWidth,
        duplicateIds: [...new Set(duplicateIds)],
        brokenImages,
        unnamedControls,
        title: document.title,
        headings: document.querySelectorAll("h1").length,
      };
    });

    expect(result.title, `${path} needs a useful document title`).not.toBe("");
    expect(result.headings, `${path} needs one visible page heading`).toBeGreaterThan(0);
    expect(result.overflow, `${path} has horizontal viewport overflow`).toBeLessThanOrEqual(2);
    expect(result.duplicateIds, `${path} has duplicate element IDs`).toEqual([]);
    expect(result.brokenImages, `${path} has broken images`).toEqual([]);
    expect(result.unnamedControls, `${path} has controls without accessible names`).toEqual([]);
    expect(pageErrors, `${path} raised browser errors`).toEqual([]);
    expect(consoleErrors, `${path} logged console errors`).toEqual([]);
    expect(failedRequests, `${path} had failed requests`).toEqual([]);
  } catch (error) {
    await testInfo.attach(`page-${path.replace(/\W+/g, "-") || "home"}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    throw error;
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
  }
}
