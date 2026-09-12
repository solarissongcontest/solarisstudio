import { expect, type Page, type TestInfo } from "@playwright/test";

export const STATIC_PUBLIC_ROUTES = [
  "/",
  "/analysis",
  "/anniversary",
  "/archive-games",
  "/auth",
  "/beta-test",
  "/broadcast-intelligence",
  "/compare",
  "/confirmations",
  "/countries",
  "/editions",
  "/guide",
  "/integrity",
  "/integrity/anonymous-appeal",
  "/integrity/appeals",
  "/integrity/preclearance",
  "/jury-voting",
  "/library",
  "/next-in-line",
  "/participate",
  "/predictions",
  "/pulse",
  "/records",
  "/relationships",
  "/result-lab",
  "/results",
  "/rules",
  "/rules/changes",
  "/rules/interpretations",
  "/rules/17.2",
  "/scorecharts",
  "/shows",
  "/taste-dna",
  "/televoting",
  "/tools",
  "/wiki",
] as const;

const ignorableRequest = (url: string) =>
  /favicon|google-analytics|googletagmanager|browser-extension|chrome-extension/i.test(url);

const criticalResourceTypes = new Set(["document", "script", "stylesheet", "font", "image"]);

function isNavigationCancellation(errorText: string | undefined) {
  return /ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(errorText ?? "");
}

function isAnonymousResourceConsoleError(message: string) {
  // Chromium reports HTTP resource failures to console without exposing the URL in
  // message.text(). We audit critical HTTP responses separately below, where the
  // URL and resource type are available. Counting this anonymous duplicate would
  // make optional API 404s indistinguishable from missing application assets.
  return /^Failed to load resource: the server responded with a status of \d{3} \(\)$/i.test(message.trim());
}

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
  const failedCriticalResponses: string[] = [];

  const onConsole = (message: { type(): string; text(): string }) => {
    if (
      message.type() === "error" &&
      !/favicon|hydration (?:failed because|completed but contains)/i.test(message.text()) &&
      !isAnonymousResourceConsoleError(message.text())
    ) {
      consoleErrors.push(message.text());
    }
  };
  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onRequestFailed = (request: { url(): string; failure(): { errorText: string } | null }) => {
    const failure = request.failure()?.errorText;
    if (!ignorableRequest(request.url()) && !isNavigationCancellation(failure)) {
      failedRequests.push(`${request.url()} — ${failure ?? "failed"}`);
    }
  };
  const onResponse = (response: {
    status(): number;
    url(): string;
    request(): { resourceType(): string };
  }) => {
    if (response.status() < 400 || ignorableRequest(response.url())) return;
    const resourceType = response.request().resourceType();
    if (!criticalResourceTypes.has(resourceType)) return;
    failedCriticalResponses.push(`${response.status()} ${resourceType} ${response.url()}`);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  try {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${path} should return a successful document`).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("h1").first(), `${path} needs one visible page heading`).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(250);

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
          const nestedLabel = node.closest("label")?.textContent?.trim();
          const explicitLabel = node.id
            ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(node.id)}"]`)?.textContent?.trim()
            : undefined;
          return !(
            node.getAttribute("aria-label") ||
            node.getAttribute("aria-labelledby") ||
            node.textContent?.trim() ||
            nestedLabel ||
            explicitLabel ||
            (node as HTMLInputElement).title
          );
        })
        .map((node) => node.outerHTML.slice(0, 180));
      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        mainCount: document.querySelectorAll("main").length,
        duplicateIds: [...new Set(duplicateIds)],
        brokenImages,
        unnamedControls,
        title: document.title,
      };
    });

    expect(result.title, `${path} needs a useful document title`).not.toBe("");
    expect(result.overflow, `${path} has horizontal viewport overflow`).toBeLessThanOrEqual(2);
    expect(result.mainCount, `${path} should contain exactly one main landmark`).toBe(1);
    expect(result.duplicateIds, `${path} has duplicate element IDs`).toEqual([]);
    expect(result.brokenImages, `${path} has broken images`).toEqual([]);
    expect(result.unnamedControls, `${path} has controls without accessible names`).toEqual([]);
    expect(pageErrors, `${path} raised browser errors`).toEqual([]);
    expect(consoleErrors, `${path} logged console errors`).toEqual([]);
    expect(failedRequests, `${path} had failed requests`).toEqual([]);
    expect(failedCriticalResponses, `${path} returned failing critical resources`).toEqual([]);
  } catch (error) {
    // Diagnostics must never replace the assertion that actually failed. Font or
    // image loading can make Playwright screenshots time out on an already-broken
    // page, so attach one only when capture succeeds promptly.
    try {
      const body = await page.screenshot({ timeout: 5_000 });
      await testInfo.attach(`page-${path.replace(/\W+/g, "-") || "home"}`, {
        body,
        contentType: "image/png",
      });
    } catch {
      // Preserve the original audit error.
    }
    throw error;
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
  }
}
