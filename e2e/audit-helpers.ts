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
  "/encyclopedia",
  "/fantasy",
  "/guide",
  "/integrity",
  "/integrity/anonymous-appeal",
  "/integrity/appeals",
  "/integrity/decisions",
  "/integrity/preclearance",
  "/integrity/privacy",
  "/integrity/process",
  "/integrity/recover",
  "/jury-voting",
  "/library",
  "/next-in-line",
  "/participate",
  "/predictions",
  "/prediction-league",
  "/pulse",
  "/records",
  "/relationships",
  "/result-lab",
  "/results",
  "/rules",
  "/rules/answers",
  "/rules/changes",
  "/rules/check",
  "/rules/chapters",
  "/rules/chapters/roleplay-worldbuilding",
  "/rules/interpretations",
  "/rules/participating",
  "/rules/search",
  "/rules/17.2",
  "/rules/22.5",
  "/scorecharts",
  "/shows",
  "/stories",
  "/taste-dna",
  "/televoting",
  "/tools",
  "/voting-dna",
  "/wiki",
] as const;

const ignorableRequest = (url: string) =>
  /favicon|google-analytics|googletagmanager|browser-extension|chrome-extension/i.test(url);

const criticalResourceTypes = new Set(["document", "script", "stylesheet", "font"]);

function isBackendApiResponse(url: string) {
  return (
    /\/rest\/v1\//i.test(url) ||
    /\/auth\/v1\//i.test(url) ||
    /\/storage\/v1\//i.test(url) ||
    /\.supabase\.co\//i.test(url)
  );
}

function isNavigationCancellation(errorText: string | undefined) {
  return /ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(errorText ?? "");
}

function isAnonymousResourceConsoleError(message: string) {
  // Chromium/WebKit emit this generic console error without the failing URL.
  // The response listener below records actionable status + resource type + URL
  // for backend/critical resources, while brokenImages covers image failures.
  return /^Failed to load resource: the server responded with a status of \d{3}(?: \([^)]*\))?$/i.test(message.trim());
}

export async function sitemapRoutes(baseURL: string) {
  const maintenanceBypass =
    process.env.SOLARIS_E2E_BYPASS_MAINTENANCE === "1"
      ? { cookie: "solaris_e2e_maintenance_bypass=1" }
      : undefined;
  const response = await fetch(new URL("/sitemap.xml", baseURL), {
    headers: maintenanceBypass,
  });
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
      !/favicon|hydration (?:failed because|completed but contains)|a tree hydrated but some attributes/i.test(message.text()) &&
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
    if (
      !criticalResourceTypes.has(resourceType) &&
      !isBackendApiResponse(response.url())
    ) {
      return;
    }
    failedCriticalResponses.push(`${response.status()} ${resourceType} ${response.url()}`);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  try {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);

    const status = await page.evaluate(() => document.readyState);
    expect(status).not.toBe("loading");

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow, `${path} has horizontal viewport overflow`).toBeLessThanOrEqual(1);

    const brokenImages = await page.locator("img").evaluateAll((images) =>
      images
        .filter((image) => {
          const element = image as HTMLImageElement;
          return Boolean(element.currentSrc || element.src) && (!element.complete || element.naturalWidth === 0);
        })
        .map((image) => (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src),
    );

    expect(
      [...new Set(consoleErrors)],
      `${path} produced unexpected console errors`,
    ).toEqual([]);
    expect(
      [...new Set(pageErrors)],
      `${path} produced page errors`,
    ).toEqual([]);
    expect(
      [...new Set(failedRequests)],
      `${path} produced failed network requests`,
    ).toEqual([]);
    expect(
      [...new Set(failedCriticalResponses)],
      `${path} produced failed critical/backend responses`,
    ).toEqual([]);
    expect(
      [...new Set(brokenImages)],
      `${path} contains broken images`,
    ).toEqual([]);
  } catch (error) {
    if (!page.isClosed()) {
      await page.screenshot({
        path: testInfo.outputPath(`failure-${path.replace(/[^a-z0-9]+/gi, "-") || "home"}.png`),
        fullPage: true,
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
  }
}
