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

const criticalResourceTypes = new Set(["document", "script", "stylesheet", "font"]);

function isNavigationCancellation(errorText: string | undefined) {
  return /ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(errorText ?? "");
}

function isAnonymousResourceConsoleError(message: string) {
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

      const intersects = (first: DOMRect, second: DOMRect) => {
        const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        return width > 1 && height > 1;
      };

      const countryHeroCollisions: string[] = [];
      for (const hero of document.querySelectorAll<HTMLElement>(".country-identity-hero")) {
        const regions = [
          ["copy", hero.querySelector<HTMLElement>(".country-hero-copy")],
          ["flag", hero.querySelector<HTMLElement>(".country-hero-flag-zone")],
          ["actions", hero.querySelector<HTMLElement>(".country-hero-actions")],
          ["art", hero.querySelector<HTMLElement>(".country-hero-art")],
        ] as const;
        const visible = regions.filter(([, node]) => {
          if (!node) return false;
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
        });
        for (let left = 0; left < visible.length; left += 1) {
          for (let right = left + 1; right < visible.length; right += 1) {
            const [leftName, leftNode] = visible[left];
            const [rightName, rightNode] = visible[right];
            if (!leftNode || !rightNode) continue;
            if (intersects(leftNode.getBoundingClientRect(), rightNode.getBoundingClientRect())) {
              countryHeroCollisions.push(`${hero.dataset.countryPersonality ?? "unknown"}: ${leftName} overlaps ${rightName}`);
            }
          }
        }
      }

      // The contain/no-crop contract belongs to the Country/Wiki identity
      // system. Edition participant flag chips intentionally use cover in some
      // compact tables, so auditing every data-flag-role on the entire site
      // turns a Country visual invariant into an unrelated Edition failure.
      const officialFlagProblems = [...document.querySelectorAll<HTMLImageElement>(
        '.country-identity-hero [data-flag-role="official"] img, .wiki-canvas [data-flag-role="official"] img',
      )].flatMap((image) => {
        const style = getComputedStyle(image);
        // Responsive Wiki variants intentionally keep a desktop infobox mounted
        // while hiding it on smaller viewports. Audit only flags that actually
        // participate in layout; a display:none ancestor produces no client rects.
        if (image.getClientRects().length === 0 || style.display === "none" || style.visibility === "hidden") {
          return [];
        }
        const problems: string[] = [];
        if (style.objectFit !== "contain") problems.push(`${image.alt || image.src}: object-fit=${style.objectFit}`);
        const rect = image.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) problems.push(`${image.alt || image.src}: zero rendered size`);
        return problems;
      });

      const countryHeroTitleProblems = [...document.querySelectorAll<HTMLElement>(
        ".country-identity-hero .country-hero-title",
      )].flatMap((title) => {
        if (title.getClientRects().length === 0) return [];
        const hero = title.closest<HTMLElement>(".country-identity-hero");
        if (!hero) return [];
        const titleRect = title.getBoundingClientRect();
        const heroRect = hero.getBoundingClientRect();
        const tolerance = 2;
        const personality = hero.dataset.countryPersonality ?? "unknown";
        const problems: string[] = [];
        if (titleRect.top < heroRect.top - tolerance) {
          problems.push(`${personality}: title paints above the Country hero`);
        }
        if (titleRect.bottom > heroRect.bottom + tolerance) {
          problems.push(`${personality}: title paints below the Country hero`);
        }
        if (titleRect.left < heroRect.left - tolerance || titleRect.right > heroRect.right + tolerance) {
          problems.push(`${personality}: title paints outside the Country hero horizontally`);
        }
        return problems;
      });

      const countryHeroMobileArtProblems = [...document.querySelectorAll<HTMLElement>(
        ".country-identity-hero[data-country-has-art='true'] .country-hero-art",
      )].flatMap((art) => {
        if (window.innerWidth > 639 || art.getClientRects().length === 0) return [];
        const style = getComputedStyle(art);
        if (style.display === "none" || style.visibility === "hidden") return [];
        const rect = art.getBoundingClientRect();
        const personality =
          art.closest<HTMLElement>(".country-identity-hero")?.dataset.countryPersonality ?? "unknown";
        if (rect.height > 114) {
          return [`${personality}: mobile personality art is ${Math.round(rect.height)}px tall`];
        }
        return [];
      });

      const countryHeroFlagSizeProblems = [...document.querySelectorAll<HTMLImageElement>(
        '.country-identity-hero [data-flag-role="official"] img',
      )].flatMap((image) => {
        if (window.innerWidth > 639 || image.getClientRects().length === 0) return [];
        const rect = image.getBoundingClientRect();
        const personality =
          image.closest<HTMLElement>(".country-identity-hero")?.dataset.countryPersonality ?? "unknown";
        // Source-driven mobile flag boxes top out at 168 × 112px. A tiny
        // tolerance keeps fractional browser pixels from turning QA into theatre.
        if (rect.width > 170 || rect.height > 114) {
          return [`${personality}: mobile official flag rendered ${Math.round(rect.width)}×${Math.round(rect.height)}px`];
        }
        return [];
      });

      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        mainCount: document.querySelectorAll("main").length,
        duplicateIds: [...new Set(duplicateIds)],
        brokenImages,
        unnamedControls,
        countryHeroCollisions,
        officialFlagProblems,
        countryHeroTitleProblems,
        countryHeroMobileArtProblems,
        countryHeroFlagSizeProblems,
        title: document.title,
      };
    });

    expect(result.title, `${path} needs a useful document title`).not.toBe("");
    expect(result.overflow, `${path} has horizontal viewport overflow`).toBeLessThanOrEqual(2);
    expect(result.mainCount, `${path} should contain exactly one main landmark`).toBe(1);
    expect(result.duplicateIds, `${path} has duplicate element IDs`).toEqual([]);
    expect(result.brokenImages, `${path} has broken images`).toEqual([]);
    expect(result.unnamedControls, `${path} has controls without accessible names`).toEqual([]);
    expect(result.countryHeroCollisions, `${path} has overlapping country hero semantic regions`).toEqual([]);
    expect(result.officialFlagProblems, `${path} distorts or hides official flag media`).toEqual([]);
    expect(result.countryHeroTitleProblems, `${path} clips a Country hero title`).toEqual([]);
    expect(
      result.countryHeroMobileArtProblems,
      `${path} renders a billboard-sized mobile personality art region`,
    ).toEqual([]);
    expect(
      result.countryHeroFlagSizeProblems,
      `${path} renders an oversized mobile Country hero flag`,
    ).toEqual([]);
    expect(pageErrors, `${path} raised browser errors`).toEqual([]);
    expect(consoleErrors, `${path} logged console errors`).toEqual([]);
    expect(failedRequests, `${path} had failed requests`).toEqual([]);
    expect(failedCriticalResponses, `${path} returned failing critical resources`).toEqual([]);
  } catch (error) {
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
